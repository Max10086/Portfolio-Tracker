'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import {
  CHART_BORDER,
  CHART_NEGATIVE,
  CHART_POSITIVE,
  ChartTooltipRow,
  ChartTooltipShell,
  chartAxisProps,
  chartGridProps,
  formatCompactMoney,
  formatFullMoney,
} from './chart-theme';
import type { AssetRow, BehaviorStats, BreakdownRow } from './types';

interface StrategyQualityViewProps {
  byTag: BreakdownRow[];
  byAsset: AssetRow[];
  behaviorStats: BehaviorStats;
  baseCurrency: string;
  onDrillTag?: (tag: string) => void;
}

export function StrategyQualityView({
  byTag,
  byAsset,
  behaviorStats,
  baseCurrency,
  onDrillTag,
}: StrategyQualityViewProps) {
  const [scope, setScope] = useState<'tag' | 'asset'>('tag');

  const scatterData = useMemo(() => {
    const source = scope === 'tag' ? byTag : byAsset;
    return source
      .map((row) => {
        const trades = row.trades;
        const winRate = row.winRate;
        const totalPnL = row.totalPnL;
        const key = scope === 'tag' ? (row as BreakdownRow).key : (row as AssetRow).symbol;
        const lowSample = trades < 3;
        return {
          name: key,
          winRate,
          totalPnL,
          trades,
          lowSample,
          tag: scope === 'tag' ? key : (row as AssetRow).tag,
          fill: lowSample ? '#94a3b8' : totalPnL >= 0 ? CHART_POSITIVE : CHART_NEGATIVE,
        };
      })
      .filter((d) => d.trades > 0);
  }, [byTag, byAsset, scope]);

  const holdingData = [
    { label: 'Winners', days: behaviorStats.avgHoldingDaysWinner, fill: CHART_POSITIVE },
    { label: 'Losers', days: behaviorStats.avgHoldingDaysLoser, fill: CHART_NEGATIVE },
  ];

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">Win rate vs total PnL</p>
          <div className="flex gap-1 rounded-md border border-border bg-muted/30 p-1">
            <Button
              type="button"
              size="sm"
              variant={scope === 'tag' ? 'secondary' : 'ghost'}
              className="h-7 text-xs"
              onClick={() => setScope('tag')}
            >
              By tag
            </Button>
            <Button
              type="button"
              size="sm"
              variant={scope === 'asset' ? 'secondary' : 'ghost'}
              className="h-7 text-xs"
              onClick={() => setScope('asset')}
            >
              By asset
            </Button>
          </div>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          Bubble size = closed trade count. Gray = fewer than 3 trades. Click a point to open table by tag.
        </p>
        {scatterData.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Not enough closed trades.</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 12, right: 20, left: 4, bottom: 12 }}>
              <CartesianGrid {...chartGridProps} />
              <XAxis
                {...chartAxisProps}
                type="number"
                dataKey="winRate"
                domain={[0, 100]}
                tickFormatter={(v) => `${Math.round(Number(v))}%`}
                label={{
                  value: 'Win rate',
                  position: 'insideBottom',
                  offset: -4,
                  fill: 'hsl(var(--muted-foreground))',
                  fontSize: 11,
                  fontFamily: 'inherit',
                }}
              />
              <YAxis
                {...chartAxisProps}
                type="number"
                dataKey="totalPnL"
                width={56}
                tickFormatter={(v) => formatCompactMoney(Number(v), baseCurrency)}
                label={{
                  value: 'Total PnL',
                  angle: -90,
                  position: 'insideLeft',
                  fill: 'hsl(var(--muted-foreground))',
                  fontSize: 11,
                  fontFamily: 'inherit',
                }}
              />
              <ZAxis type="number" dataKey="trades" range={[40, 400]} />
              <ReferenceLine y={0} stroke={CHART_BORDER} strokeWidth={1} />
              <ReferenceLine x={50} stroke={CHART_BORDER} strokeDasharray="4 4" />
              <Tooltip
                cursor={{ strokeDasharray: '3 3', stroke: CHART_BORDER }}
                content={({ payload }) => {
                  const p = payload?.[0]?.payload as (typeof scatterData)[0] | undefined;
                  if (!p) return null;
                  return (
                    <ChartTooltipShell title={p.name}>
                      <ChartTooltipRow label="Win rate" value={`${p.winRate.toFixed(1)}%`} />
                      <ChartTooltipRow label="Total PnL" value={formatFullMoney(p.totalPnL, baseCurrency)} />
                      <ChartTooltipRow
                        label="Trades"
                        value={`${p.trades}${p.lowSample ? ' (low sample)' : ''}`}
                      />
                    </ChartTooltipShell>
                  );
                }}
              />
              <Scatter
                data={scatterData}
                fill="#8884d8"
                onClick={(d) => {
                  const row = d as (typeof scatterData)[0];
                  onDrillTag?.(scope === 'tag' ? row.name : row.tag);
                }}
                shape={(props: {
                  cx?: number;
                  cy?: number;
                  payload?: { trades?: number; fill?: string };
                }) => {
                  const { cx, cy, payload } = props;
                  if (cx == null || cy == null) return <g />;
                  const r = Math.min(18, 6 + (payload?.trades ?? 1) * 1.2);
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={payload?.fill ?? '#94a3b8'}
                      fillOpacity={0.85}
                      stroke="hsl(var(--background))"
                      strokeWidth={1.5}
                    />
                  );
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Average holding period (closed trades)</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Max loss streak: {behaviorStats.maxLossStreak} · Trades (30d): {behaviorStats.trades30d}
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={holdingData} margin={{ top: 12, right: 16, left: 4, bottom: 12 }}>
            <CartesianGrid {...chartGridProps} />
            <XAxis {...chartAxisProps} dataKey="label" />
            <YAxis
              {...chartAxisProps}
              width={48}
              tickFormatter={(v) => `${Number(v).toFixed(0)}d`}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const days = Number(payload[0].value);
                return (
                  <ChartTooltipShell title={String(label)}>
                    <ChartTooltipRow label="Avg hold" value={`${days.toFixed(1)} days`} />
                  </ChartTooltipShell>
                );
              }}
            />
            <Bar dataKey="days" radius={[4, 4, 0, 0]}>
              {holdingData.map((entry) => (
                <Cell key={entry.label} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
