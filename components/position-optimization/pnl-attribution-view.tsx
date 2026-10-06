'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import {
  CHART_NEGATIVE,
  CHART_POSITIVE,
  ChartTooltipRow,
  ChartTooltipShell,
  chartAxisProps,
  chartGridProps,
  formatCompactMoney,
  formatFullMoney,
} from './chart-theme';
import type { AssetRow, AttributionDimension, BreakdownRow, PnlMetric } from './types';

function metricValue(row: BreakdownRow | AssetRow, metric: PnlMetric, dimension: AttributionDimension): number {
  if (dimension === 'asset') {
    const a = row as AssetRow;
    if (metric === 'realized') return a.realizedPnL;
    if (metric === 'unrealized') return a.unrealizedPnL;
    return a.totalPnL;
  }
  const b = row as BreakdownRow;
  if (metric === 'realized') return b.realizedPnL;
  if (metric === 'unrealized') return b.unrealizedPnL;
  return b.totalPnL;
}

function rowLabel(row: BreakdownRow | AssetRow, dimension: AttributionDimension): string {
  if (dimension === 'asset') {
    const a = row as AssetRow;
    return a.symbol;
  }
  return (row as BreakdownRow).key;
}

function rollupTagsFromAssets(assets: AssetRow[]): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const asset of assets) {
    const key = asset.tag?.trim() || 'Uncategorized';
    const row = map.get(key) || {
      key,
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalPnL: 0,
      currentValue: 0,
      trades: 0,
      winRate: 0,
    };
    row.realizedPnL += asset.realizedPnL;
    row.unrealizedPnL += asset.unrealizedPnL;
    row.totalPnL += asset.totalPnL;
    row.currentValue += asset.currentValue;
    row.trades += asset.trades;
    map.set(key, row);
  }
  return Array.from(map.values());
}

function yAxisWidth(labels: string[]): number {
  const maxLen = labels.reduce((max, label) => Math.max(max, label.length), 0);
  return Math.min(200, Math.max(96, maxLen * 8));
}

const METRIC_LABEL: Record<PnlMetric, string> = {
  total: 'Total PnL',
  realized: 'Realized PnL',
  unrealized: 'Unrealized PnL',
};

interface PnlAttributionViewProps {
  byTag?: BreakdownRow[];
  byMarket: BreakdownRow[];
  byAsset: AssetRow[];
  baseCurrency: string;
  onDrillTag?: (tag: string) => void;
  onDrillAsset?: (symbol: string, marketType: string) => void;
}

export function PnlAttributionView({
  byMarket,
  byAsset,
  baseCurrency,
  onDrillTag,
  onDrillAsset,
}: PnlAttributionViewProps) {
  const [dimension, setDimension] = useState<AttributionDimension>('tag');
  const [metric, setMetric] = useState<PnlMetric>('total');

  const chartData = useMemo(() => {
    const source =
      dimension === 'tag'
        ? rollupTagsFromAssets(byAsset)
        : dimension === 'market'
          ? byMarket
          : byAsset;
    const rows = [...source].filter((row) => {
      if (metric !== 'unrealized') return true;
      const unrealized =
        dimension === 'asset'
          ? (row as AssetRow).unrealizedPnL
          : (row as BreakdownRow).unrealizedPnL;
      return Math.abs(unrealized) >= 0.01;
    });

    return rows
      .map((row) => ({
        name: rowLabel(row, dimension),
        value: metricValue(row, metric, dimension),
        tag: dimension === 'tag' ? (row as BreakdownRow).key : (row as AssetRow).tag,
        symbol: dimension === 'asset' ? (row as AssetRow).symbol : undefined,
        marketType: dimension === 'asset' ? (row as AssetRow).marketType : undefined,
      }))
      .sort((a, b) => a.value - b.value);
  }, [byMarket, byAsset, dimension, metric]);

  const yWidth = useMemo(() => yAxisWidth(chartData.map((d) => d.name)), [chartData]);

  if (chartData.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No data for attribution.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-wrap gap-1 rounded-md border border-border bg-muted/30 p-1">
          {(['tag', 'market', 'asset'] as const).map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={dimension === d ? 'secondary' : 'ghost'}
              className="h-7 text-xs"
              onClick={() => setDimension(d)}
            >
              {d === 'tag' ? 'Tag' : d === 'market' ? 'Market' : 'Asset'}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 rounded-md border border-border bg-muted/30 p-1">
          {(['total', 'realized', 'unrealized'] as const).map((m) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={metric === m ? 'secondary' : 'ghost'}
              className="h-7 text-xs"
              onClick={() => setMetric(m)}
            >
              {METRIC_LABEL[m]}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {metric === 'unrealized'
          ? `Showing ${chartData.length} ${dimension === 'tag' ? 'tags' : dimension === 'market' ? 'markets' : 'assets'} with open PnL.`
          : `Showing all ${chartData.length} ${dimension === 'tag' ? 'tags' : dimension === 'market' ? 'markets' : 'assets'}.`}{' '}
        Click a bar to drill down.
      </p>
      <ResponsiveContainer
        width="100%"
        height={Math.max(280, chartData.length * 36)}
      >
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 12, right: 20, left: 8, bottom: 12 }}
        >
          <CartesianGrid {...chartGridProps} horizontal={false} />
          <XAxis
            {...chartAxisProps}
            type="number"
            tickFormatter={(v) => formatCompactMoney(Number(v), baseCurrency)}
          />
          <YAxis
            {...chartAxisProps}
            type="category"
            dataKey="name"
            width={yWidth}
            interval={0}
            tickLine={false}
          />
          <ReferenceLine x={0} stroke="hsl(var(--border))" strokeWidth={1} />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const value = Number(payload[0].value);
              return (
                <ChartTooltipShell title={String(label)}>
                  <ChartTooltipRow label={METRIC_LABEL[metric]} value={formatFullMoney(value, baseCurrency)} />
                </ChartTooltipShell>
              );
            }}
          />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            cursor="pointer"
            onClick={(entry) => {
              const payload = entry?.payload as (typeof chartData)[0] | undefined;
              if (!payload) return;
              if (dimension === 'asset' && payload.symbol && payload.marketType) {
                onDrillAsset?.(payload.symbol, payload.marketType);
              } else if (dimension === 'tag') {
                onDrillTag?.(payload.name);
              } else {
                onDrillTag?.(payload.tag || payload.name);
              }
            }}
          >
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.value >= 0 ? CHART_POSITIVE : CHART_NEGATIVE} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
