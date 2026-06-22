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

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

function downsampleByInterval(
  snapshots: PortfolioSnapshot[],
  intervalMs: number
): PortfolioSnapshot[] {
  if (snapshots.length <= 2) return snapshots;

  const bucketMap = new Map<number, PortfolioSnapshot>();
  for (const snapshot of snapshots) {
    const time = new Date(snapshot.recorded_at).getTime();
    const bucket = Math.floor(time / intervalMs);
    bucketMap.set(bucket, snapshot);
  }

  return Array.from(bucketMap.values()).sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );
}

function smoothTransientNegativeSpikes(snapshots: PortfolioSnapshot[]): PortfolioSnapshot[] {
  if (snapshots.length < 3) return snapshots;

  const smoothed = snapshots.map((snapshot) => ({
    ...snapshot,
    total_value: Number(snapshot.total_value),
  }));

  for (let i = 1; i < smoothed.length - 1; i++) {
    const left = smoothed[i - 1];
    const leftValue = Number(left.total_value);
    if (leftValue <= 0) continue;

    const firstDip = Number(smoothed[i].total_value);
    if (firstDip >= leftValue * 0.92) continue;

    const leftTime = new Date(left.recorded_at).getTime();
    let recoveryIndex = -1;

    for (let j = i + 1; j < smoothed.length; j++) {
      const elapsed = new Date(smoothed[j].recorded_at).getTime() - leftTime;
      if (elapsed > EIGHT_HOURS_MS) break;
      if (Number(smoothed[j].total_value) >= leftValue * 0.97) {
        recoveryIndex = j;
        break;
      }
    }

    if (recoveryIndex === -1) continue;

    const dipSegment = smoothed.slice(i, recoveryIndex);
    const minValue = Math.min(...dipSegment.map((point) => Number(point.total_value)));
    const dropAmount = leftValue - minValue;
    const dropRatio = dropAmount / leftValue;

    if (dropAmount < 1500 && dropRatio < 0.08) continue;

    const right = smoothed[recoveryIndex];
    const rightValue = Number(right.total_value);
    const rightTime = new Date(right.recorded_at).getTime();
    const totalDuration = rightTime - leftTime || 1;

    for (let k = i; k < recoveryIndex; k++) {
      const t = (new Date(smoothed[k].recorded_at).getTime() - leftTime) / totalDuration;
      smoothed[k] = {
        ...smoothed[k],
        total_value: leftValue + (rightValue - leftValue) * t,
      };
    }

    i = recoveryIndex - 1;
  }

  return smoothed;
}

function suppressShortLivedDrops(
  snapshots: PortfolioSnapshot[],
  maxDropDurationMs: number,
  options?: {
    minDropAmount?: number;
    minDropRatio?: number;
    recoveryRatio?: number;
  }
): PortfolioSnapshot[] {
  if (snapshots.length < 4) return snapshots;

  const minDropAmount = options?.minDropAmount ?? 3000;
  const minDropRatio = options?.minDropRatio ?? 0.05;
  const recoveryRatio = options?.recoveryRatio ?? 0.95;

  const result = snapshots.map((snapshot) => ({
    ...snapshot,
    total_value: Number(snapshot.total_value),
  }));

  for (let i = 1; i < result.length - 2; i++) {
    const left = result[i - 1];
    const leftValue = Number(left.total_value);
    if (leftValue <= 0) continue;

    const currValue = Number(result[i].total_value);
    const dropAmount = leftValue - currValue;
    const dropRatio = dropAmount / leftValue;
    if (dropAmount < minDropAmount && dropRatio < minDropRatio) continue;

    const leftTime = new Date(left.recorded_at).getTime();
    let recoverAt = -1;

    for (let j = i + 1; j < result.length; j++) {
      const elapsed = new Date(result[j].recorded_at).getTime() - leftTime;
      if (elapsed > maxDropDurationMs) break;
      if (Number(result[j].total_value) >= leftValue * recoveryRatio) {
        recoverAt = j;
        break;
      }
    }

    if (recoverAt === -1) continue;

    const right = result[recoverAt];
    const rightValue = Number(right.total_value);
    const rightTime = new Date(right.recorded_at).getTime();
    const totalDuration = rightTime - leftTime || 1;

    for (let k = i; k < recoverAt; k++) {
      const t = (new Date(result[k].recorded_at).getTime() - leftTime) / totalDuration;
      result[k] = {
        ...result[k],
        total_value: leftValue + (rightValue - leftValue) * t,
      };
    }

    i = recoverAt - 1;
  }

  return result;
}

function smoothIsolatedNegativeSpikes(data: ChartData[], aggressive = false): ChartData[] {
  if (data.length < 3) return data;

  const smoothed = [...data];
  for (let i = 1; i < data.length - 1; i++) {
    const prev = smoothed[i - 1];
    const curr = smoothed[i];
    const next = smoothed[i + 1];

    if (prev.value <= 0 || next.value <= 0) continue;

    const baseline = Math.min(prev.value, next.value);
    const baselineRatio = aggressive ? 0.9 : 0.7;
    const recoveryTolerance = aggressive ? 0.08 : 0.2;
    const minDropAbs = aggressive ? 1200 : 2500;
    const hasSharpDrop = curr.value < baseline * baselineRatio;
    const dropAbs = baseline - curr.value;
    const quickRecovery = Math.abs(next.value - prev.value) / prev.value < recoveryTolerance;
    const spanMs = next.timestamp.getTime() - prev.timestamp.getTime();
    const shortSpan = spanMs <= 10 * 60 * 60 * 1000;

    if (hasSharpDrop && quickRecovery && dropAbs >= minDropAbs && shortSpan) {
      smoothed[i] = {
        ...curr,
        value: (prev.value + next.value) / 2,
      };
    }
  }

  return smoothed;
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

      let processedSnapshots = [...data.snapshots].sort(
        (a: PortfolioSnapshot, b: PortfolioSnapshot) =>
          new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
      );
      const latestSnapshot = processedSnapshots[processedSnapshots.length - 1];
      const latestTimestamp = latestSnapshot ? new Date(latestSnapshot.recorded_at).getTime() : 0;
      const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;

      // Keep chart endpoint up-to-date even when cron missed recent runs.
      if (latestTimestamp < twelveHoursAgo) {
        try {
          const liveResponse = await fetch('/api/transactions?view=holdings', {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
          });
          if (liveResponse.ok) {
            const liveData = await liveResponse.json();
            const liveTotal = Number(liveData.totalValue);
            if (!Number.isNaN(liveTotal) && liveTotal > 0) {
              processedSnapshots.push({
                id: 'live-current',
                total_value: liveTotal,
                recorded_at: new Date().toISOString(),
              });
            }
          }
        } catch (liveError) {
          console.warn('Failed to append live portfolio point:', liveError);
        }
      }

      // 7D / 1M 视图统一降采样为每 6 小时一个点，避免1小时粒度噪音与尖刺
      if (activeRange.days <= 30) {
        processedSnapshots = downsampleByInterval(processedSnapshots, SIX_HOURS_MS);
      }

      // 长周期视图按天保留一个点（缺失日期不做插值补点）
      if (activeRange.days > 30) {
        const dailyMap = new Map<string, PortfolioSnapshot>();
        processedSnapshots.forEach((snap: PortfolioSnapshot) => {
          const date = new Date(snap.recorded_at);
          // 使用 UTC 日期作为 key，后遍历到的快照（当天更晚时间）会覆盖前面的
          const dateKey = date.toISOString().slice(0, 10);
          dailyMap.set(dateKey, snap);
        });
        processedSnapshots = Array.from(dailyMap.values()).sort(
          (a: PortfolioSnapshot, b: PortfolioSnapshot) =>
            new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
        );
      }

      processedSnapshots.sort(
        (a: PortfolioSnapshot, b: PortfolioSnapshot) =>
          new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
      );
      processedSnapshots = smoothTransientNegativeSpikes(processedSnapshots);
      if (activeRange.days <= 30) {
        const oneMonthView = activeRange.days === 30;
        processedSnapshots = suppressShortLivedDrops(
          processedSnapshots,
          oneMonthView ? 12 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000,
          oneMonthView
            ? {
                minDropAmount: 1200,
                minDropRatio: 0.025,
                recoveryRatio: 0.97,
              }
            : undefined
        );
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

      setChartData(smoothIsolatedNegativeSpikes(transformed, activeRange.days === 30));
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
                interval="preserveStartEnd"
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