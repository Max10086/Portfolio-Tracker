'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface PortfolioSnapshot {
  id: string;
  total_value: number;
  recorded_at: string;
}

interface ChartData {
  time: string;
  value: number;
  timestamp: Date;
  formattedDate: string;
  formattedTime: string;
}

interface NetWorthChartProps {
  days?: number;
  limit?: number;
  refreshTrigger?: number;
}

export function NetWorthChart({ days = 30, limit, refreshTrigger }: NetWorthChartProps) {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [baseCurrency, setBaseCurrency] = useState<string>('USD');
  const [source, setSource] = useState<string>('');

  const fetchSnapshots = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.append('days', days.toString());
      params.append('includeHistory', 'true'); // Generate history from transactions
      if (limit) params.append('limit', limit.toString());

      const response = await fetch(`/api/portfolio-snapshots?${params.toString()}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || 'Failed to fetch portfolio snapshots');
      }

      const data = await response.json();
      
      if (data.error && !data.snapshots) {
        throw new Error(data.details || data.error);
      }
      
      setBaseCurrency(data.baseCurrency || 'USD');
      setSource(data.source || '');

      if (!data.snapshots || data.snapshots.length === 0) {
        setChartData([]);
        return;
      }

      // Transform data for chart
      const transformed: ChartData[] = data.snapshots.map((snapshot: PortfolioSnapshot) => {
        const timestamp = new Date(snapshot.recorded_at);
        
        // Determine date range to format appropriately
        const now = new Date();
        const oldestDate = data.snapshots.length > 0 
          ? new Date(data.snapshots[0].recorded_at)
          : timestamp;
        const dateRange = now.getTime() - oldestDate.getTime();
        const daysDiff = dateRange / (1000 * 60 * 60 * 24);

        // Format based on range
        let formattedDate: string;
        let formattedTime: string;
        let timeLabel: string;

        if (daysDiff <= 1) {
          formattedTime = timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          formattedDate = timestamp.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
          timeLabel = formattedTime;
        } else if (daysDiff <= 7) {
          formattedTime = timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          formattedDate = timestamp.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });
          timeLabel = `${timestamp.toLocaleDateString('en-US', { weekday: 'short' })} ${formattedTime}`;
        } else if (daysDiff <= 30) {
          formattedDate = timestamp.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
          formattedTime = timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          timeLabel = formattedDate;
        } else {
          formattedDate = timestamp.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });
          formattedTime = timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          timeLabel = formattedDate;
        }

        return {
          time: timeLabel,
          value: parseFloat(snapshot.total_value.toString()),
          timestamp,
          formattedDate,
          formattedTime,
        };
      });

      setChartData(transformed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [days, limit]);

  useEffect(() => {
    fetchSnapshots();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchSnapshots, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchSnapshots, refreshTrigger]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as ChartData;
      const dataIndex = chartData.findIndex(d => d.timestamp.getTime() === data.timestamp.getTime());
      const prevData = dataIndex > 0 ? chartData[dataIndex - 1] : null;
      const change = prevData ? data.value - prevData.value : 0;
      const changePercent = prevData && prevData.value !== 0 
        ? ((change / prevData.value) * 100) 
        : 0;
      
      return (
        <div className="rounded-lg border bg-card/95 backdrop-blur-sm p-3 shadow-xl ring-1 ring-border">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {data.formattedDate} {data.formattedTime}
          </p>
          <p className="text-xl font-bold mb-1">
            {baseCurrency} {data.value.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          {prevData && (
            <p className={`text-xs font-medium ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {change >= 0 ? '+' : ''}{change.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Format Y-axis values
  const formatYAxis = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  // Calculate stats
  const latestValue = chartData.length > 0 ? chartData[chartData.length - 1].value : 0;
  const firstValue = chartData.length > 0 ? chartData[0].value : 0;
  const totalChange = latestValue - firstValue;
  const totalChangePercent = firstValue !== 0 ? (totalChange / firstValue) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Net Worth
              {chartData.length > 0 && (
                <span className="text-2xl font-bold">
                  {baseCurrency} {latestValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              Portfolio value over time
              {chartData.length > 1 && (
                <span className={`text-sm font-medium ${totalChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {totalChange >= 0 ? '↑' : '↓'} {Math.abs(totalChangePercent).toFixed(2)}%
                </span>
              )}
              {source === 'generated' && (
                <span className="text-xs text-muted-foreground">• Generated from transactions</span>
              )}
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="icon"
            onClick={fetchSnapshots}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex h-[400px] items-center justify-center">
            <div className="text-muted-foreground">Loading chart data...</div>
          </div>
        )}

        {error && (
          <div className="flex h-[400px] items-center justify-center">
            <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive max-w-md">
              <p className="font-semibold mb-2">Error loading chart data</p>
              <p className="text-xs">{error}</p>
              {error.includes('table') && (
                <p className="text-xs mt-2 text-muted-foreground">
                  Please ensure the database migration has been run in Supabase.
                </p>
              )}
            </div>
          </div>
        )}

        {!loading && !error && chartData.length === 0 && (
          <div className="flex h-[400px] items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground mb-2">No data available</p>
              <p className="text-sm text-muted-foreground">
                Add transactions to see your portfolio value over time.
              </p>
            </div>
          </div>
        )}

        {!loading && !error && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart
              data={chartData}
              margin={{ top: 20, right: 20, left: 0, bottom: 10 }}
            >
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="50%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="hsl(var(--border))"
                opacity={0.2}
                vertical={false}
              />
              <XAxis
                dataKey="time"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatYAxis}
                tickMargin={8}
                width={60}
              />
              <Tooltip 
                content={<CustomTooltip />}
                cursor={{ stroke: '#10b981', strokeWidth: 1, strokeDasharray: '5 5' }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#colorValue)"
                dot={false}
                activeDot={{ 
                  r: 5, 
                  fill: '#10b981',
                  stroke: '#ffffff',
                  strokeWidth: 2,
                  filter: 'drop-shadow(0 2px 4px rgba(16, 185, 129, 0.3))'
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
