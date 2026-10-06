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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import type { ClosedTradeRow, MonthlyPerformanceRow } from './types';

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  if (!y || !m) return month;
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US');
}

interface MonthlyTimelineViewProps {
  monthlyPerformance: MonthlyPerformanceRow[];
  closedTrades: ClosedTradeRow[];
  baseCurrency: string;
}

export function MonthlyTimelineView({
  monthlyPerformance,
  closedTrades,
  baseCurrency,
}: MonthlyTimelineViewProps) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const months = useMemo(
    () => [...monthlyPerformance].sort((a, b) => a.month.localeCompare(b.month)),
    [monthlyPerformance]
  );

  const monthTrades = useMemo(() => {
    if (!selectedMonth) return [];
    return closedTrades
      .filter((t) => t.closedAt.slice(0, 7) === selectedMonth)
      .sort((a, b) => b.closedAt.localeCompare(a.closedAt));
  }, [closedTrades, selectedMonth]);

  const formatMoney = (v: number) => formatFullMoney(v, baseCurrency);

  if (months.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">No closed trades in range.</p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Monthly realized PnL from closed trades. Click a month to see individual exits.
      </p>
      <ResponsiveContainer width="100%" height={420}>
        <BarChart data={months} margin={{ top: 12, right: 16, left: 4, bottom: 12 }}>
          <CartesianGrid {...chartGridProps} />
          <XAxis
            {...chartAxisProps}
            dataKey="month"
            tickFormatter={formatMonthLabel}
            minTickGap={24}
          />
          <YAxis
            {...chartAxisProps}
            width={56}
            tickFormatter={(v) => formatCompactMoney(Number(v), baseCurrency)}
          />
          <ReferenceLine y={0} stroke={CHART_BORDER} strokeWidth={1} />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as MonthlyPerformanceRow;
              const value = Number(payload[0].value);
              return (
                <ChartTooltipShell title={formatMonthLabel(String(label))}>
                  <ChartTooltipRow label="Realized PnL" value={formatFullMoney(value, baseCurrency)} />
                  <ChartTooltipRow label="Trades" value={String(row.trades)} />
                  <ChartTooltipRow label="Win rate" value={`${row.winRate.toFixed(0)}%`} />
                </ChartTooltipShell>
              );
            }}
          />
          <Bar
            dataKey="realizedPnL"
            radius={[4, 4, 0, 0]}
            cursor="pointer"
            onClick={(data) => {
              const month = (data as { payload?: MonthlyPerformanceRow })?.payload?.month;
              if (month) setSelectedMonth((prev) => (prev === month ? null : month));
            }}
          >
            {months.map((row) => (
              <Cell
                key={row.month}
                fill={row.realizedPnL >= 0 ? CHART_POSITIVE : CHART_NEGATIVE}
                stroke={selectedMonth === row.month ? 'hsl(var(--primary))' : undefined}
                strokeWidth={selectedMonth === row.month ? 2 : 0}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {selectedMonth && (
        <div className="rounded-md border">
          <div className="border-b px-4 py-2 text-sm font-medium">
            Closed trades · {formatMonthLabel(selectedMonth)} ({monthTrades.length})
          </div>
          {monthTrades.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No trades in this month.</p>
          ) : (
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead className="text-right">PnL</TableHead>
                  <TableHead className="text-right">Return</TableHead>
                  <TableHead className="text-right">Hold (d)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthTrades.map((t, i) => (
                  <TableRow key={`${t.closedAt}-${t.symbol}-${i}`}>
                    <TableCell>{formatDate(t.closedAt)}</TableCell>
                    <TableCell>
                      {t.symbol}
                      <span className="text-muted-foreground"> · {t.marketType}</span>
                    </TableCell>
                    <TableCell>{t.tag}</TableCell>
                    <TableCell
                      className={`text-right ${t.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {formatMoney(t.pnl)}
                    </TableCell>
                    <TableCell className="text-right">{t.returnPct.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{t.holdingDays.toFixed(0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
