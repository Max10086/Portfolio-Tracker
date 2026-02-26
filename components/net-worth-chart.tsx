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
  defaultDays?: number; // 改为 defaultDays
  limit?: number;
  refreshTrigger?: number;
}

// 定义时间跨度选项
const TIME_RANGES =[
  { label: '7D', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '1Y', days: 365 },
  { label: '3Y', days: 1095 },
];

export function NetWorthChart({ defaultDays = 30, limit, refreshTrigger }: NetWorthChartProps) {
  const[chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const[baseCurrency, setBaseCurrency] = useState<string>('USD');
  const [source, setSource] = useState<string>('');
  const [usdToCnyRate, setUsdToCnyRate] = useState<number | null>(null);
  
  // 新增：当前选中的时间跨度状态
  const [activeRange, setActiveRange] = useState(
    TIME_RANGES.find(r => r.days === defaultDays) || TIME_RANGES[1]
  );

  const fetchSnapshots = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      // 使用选中的天数发起请求
      params.append('days', activeRange.days.toString());
      if (limit) params.append('limit', limit.toString());

      // 加入了防止缓存的配置
      const response = await fetch(`/api/portfolio-snapshots?${params.toString()}&_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
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

      // Fetch USD to CNY exchange rate
      if ((data.baseCurrency || 'USD') === 'USD') {
        try {
          const rateResponse = await fetch('/api/exchange-rate?from=USD&to=CNY');
          if (rateResponse.ok) {
            const rateData = await rateResponse.json();
            setUsdToCnyRate(rateData.rate);
          }
        } catch (rateError) {
          console.error('Failed to fetch USD to CNY rate:', rateError);
          setUsdToCnyRate(7.3);
        }
      } else {
        setUsdToCnyRate(null);
      }

      if (!data.snapshots || data.snapshots.length === 0) {
        setChartData([]);
        return;
      }

      let processedSnapshots = data.snapshots;

      // 💡 降采样逻辑 (Downsampling)：如果请求超过 30 天的数据，每天只保留 1 个最新数据点
      if (activeRange.days > 30) {
        const dailyMap = new Map();
        processedSnapshots.forEach((snap: PortfolioSnapshot) => {
          const date = new Date(snap.recorded_at);
          // 使用 YYYY-MM-DD 作为 key，后遍历到的（当天的最后一个小时）会覆盖前面的
          const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          dailyMap.set(dateKey, snap);
        });
        processedSnapshots = Array.from(dailyMap.values());
      }

      // Transform data for chart
      const transformed: ChartData[] = processedSnapshots.map((snapshot: PortfolioSnapshot) => {
        const timestamp = new Date(snapshot.recorded_at);
        
        const now = new Date();
        const oldestDate = processedSnapshots.length > 0 
          ? new Date(processedSnapshots[0].recorded_at)
          : timestamp;
        const dateRange = now.getTime() - oldestDate.getTime();
        const daysDiff = dateRange / (1000 * 60 * 60 * 24);

        let formattedDate: string;
        let formattedTime: string;
        let timeLabel: string;

        // 根据时间跨度优化 X 轴显示
        if (daysDiff <= 1) {
          formattedTime = timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
          formattedDate = timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          timeLabel = formattedTime;
        } else if (daysDiff <= 7) {
          formattedTime = timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
          formattedDate = timestamp.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          timeLabel = `${timestamp.toLocaleDateString('en-US', { weekday: 'short' })} ${formattedTime}`;
        } else if (daysDiff <= 30) {
          formattedDate = timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          formattedTime = timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
          timeLabel = formattedDate;
        } else if (daysDiff <= 365) {
          // 1年的跨度，X轴主要显示月份和日期
          formattedDate = timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          formattedTime = ''; // 长时间跨度隐藏具体时间
          timeLabel = timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else {
          // 3年的跨度，X轴主要显示年份和月份
          formattedDate = timestamp.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          formattedTime = '';
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
  }, [activeRange.days, limit]);

  useEffect(() => {
    fetchSnapshots();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchSnapshots, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchSnapshots, refreshTrigger]);

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
            {data.formattedDate} {data.formattedTime && data.formattedTime}
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

  const formatYAxis = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  const latestValue = chartData.length > 0 ? chartData[chartData.length - 1].value : 0;
  const firstValue = chartData.length > 0 ? chartData[0].value : 0;
  const totalChange = latestValue - firstValue;
  const totalChangePercent = firstValue !== 0 ? (totalChange / firstValue) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              Net Worth
              {chartData.length > 0 && (
                <span className="text-2xl font-bold">
                  {baseCurrency} {latestValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </CardTitle>
            <CardDescription className="flex items-center gap-2 flex-wrap mt-1">
              Portfolio value over time
              {chartData.length > 1 && (
                <span className={`text-sm font-medium ${totalChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {totalChange >= 0 ? '↑' : '↓'} {Math.abs(totalChangePercent).toFixed(2)}%
                </span>
              )}
              {baseCurrency === 'USD' && usdToCnyRate !== null && chartData.length > 0 && (
                <span className="text-sm font-medium text-muted-foreground">
                  • Net worth in CNY: ¥{(latestValue * usdToCnyRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </CardDescription>
          </div>
          
          {/* 新增：时间跨度切换器 */}
          <div className="flex items-center gap-2">
            <div className="flex bg-muted/50 rounded-md p-1">
              {TIME_RANGES.map((range) => (
                <Button
                  key={range.label}
                  variant={activeRange.label === range.label ? "secondary" : "ghost"}
                  size="sm"
                  className={`h-7 px-3 text-xs ${activeRange.label === range.label ? 'shadow-sm font-medium' : 'text-muted-foreground'}`}
                  onClick={() => setActiveRange(range)}
                  disabled={loading}
                >
                  {range.label}
                </Button>
              ))}
            </div>
            <Button 
              variant="outline" 
              size="icon"
              className="h-8 w-8"
              onClick={fetchSnapshots}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
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
            </div>
          </div>
        )}

        {!loading && !error && chartData.length === 0 && (
          <div className="flex h-[400px] items-center justify-center">
            <div className="text-center max-w-sm">
              <p className="text-muted-foreground mb-2">No snapshots yet</p>
              <p className="text-sm text-muted-foreground">
                Portfolio value is recorded periodically by the cron job. Add transactions and wait for the next run.
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
                // 自动调整 X 轴标签密度以防止重叠
                minTickGap={30}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatYAxis}
                tickMargin={8}
                width={60}
                // 动态调整 Y 轴范围，使波动更明显
                domain={['dataMin * 0.95', 'dataMax * 1.05']}
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