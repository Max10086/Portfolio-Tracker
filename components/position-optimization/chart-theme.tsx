'use client';

import type { ReactNode } from 'react';

export const CHART_MUTED = 'hsl(var(--muted-foreground))';
export const CHART_BORDER = 'hsl(var(--border))';
export const CHART_POSITIVE = '#16a34a';
export const CHART_NEGATIVE = '#dc2626';

/** Match net-worth chart axis typography (SVG ticks inherit app font). */
export const chartTick = {
  fontSize: 11,
  fill: CHART_MUTED,
  fontFamily: 'inherit',
};

export const chartAxisProps = {
  stroke: CHART_MUTED,
  fontSize: 11,
  tickLine: false as const,
  axisLine: false as const,
  tick: chartTick,
  tickMargin: 8,
};

export const chartGridProps = {
  strokeDasharray: '3 3',
  stroke: CHART_BORDER,
  opacity: 0.35,
};

export function formatCompactMoney(value: number, currency: string): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  let prefix = `${currency} `;
  if (currency === 'USD') prefix = '$';
  else if (currency === 'CNY') prefix = '¥';
  else if (currency === 'HKD') prefix = 'HK$';

  if (abs >= 1_000_000) return `${sign}${prefix}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}${prefix}${(abs / 1_000).toFixed(1)}K`;
  if (abs >= 100) return `${sign}${prefix}${abs.toFixed(0)}`;
  return `${sign}${prefix}${abs.toFixed(1)}`;
}

export function formatFullMoney(value: number, currency: string): string {
  const sign = value >= 0 ? '' : '-';
  return `${sign}${currency} ${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function ChartTooltipShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card/95 backdrop-blur-sm p-3 shadow-xl ring-1 ring-border">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

export function ChartTooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span>{label}: </span>
      <span className="font-medium text-foreground">{value}</span>
    </p>
  );
}
