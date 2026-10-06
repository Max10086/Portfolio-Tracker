'use client';

import { useId, useMemo } from 'react';
import type { StopTierId } from './types';

const TIER_STROKE: Record<StopTierId, string> = {
  relief: '#f59e0b',
  retreat: '#ea580c',
  bailout: '#dc2626',
};

const TIER_FILL: Record<StopTierId, string> = {
  relief: 'rgba(245, 158, 11, 0.12)',
  retreat: 'rgba(234, 88, 12, 0.14)',
  bailout: 'rgba(220, 38, 38, 0.16)',
};

const PILL_H = 22;
const LABEL_GAP = 6;
const CHART_LEFT = 88;
const CHART_RIGHT = 620;

/** Now price: left column. Stop tiers: right column — avoids horizontal overlap. */
const NOW_PILL = { x: 96, w: 198 };
const STOP_PILL = { x: 402, w: 218 };

export interface LadderTier {
  tierId: StopTierId;
  labelEn: string;
  labelZh: string;
  stopPrice: number | null;
  sellPct: number | null;
  configured: boolean;
  triggered: boolean;
  activeAlert: boolean;
  acknowledged: boolean;
}

interface StopLossLadderProps {
  currentPrice: number;
  tiers: LadderTier[];
  formatPrice: (n: number) => string;
  height?: number;
}

type LabelSide = 'left' | 'right';

interface LabelEntry {
  key: string;
  baseY: number;
  side: LabelSide;
}

function layoutLabelYs(entries: LabelEntry[]): Map<string, { y: number; baseY: number }> {
  const out = new Map<string, { y: number; baseY: number }>();
  for (const side of ['left', 'right'] as const) {
    const list = entries
      .filter((e) => e.side === side)
      .sort((a, b) => a.baseY - b.baseY);
    let lastBottom = -Infinity;
    for (const item of list) {
      let y = item.baseY;
      const top = y - PILL_H / 2;
      if (top < lastBottom + LABEL_GAP) {
        y = lastBottom + LABEL_GAP + PILL_H / 2;
      }
      lastBottom = y + PILL_H / 2;
      out.set(item.key, { y, baseY: item.baseY });
    }
  }
  return out;
}

export function StopLossLadder({
  currentPrice,
  tiers,
  formatPrice,
  height = 220,
}: StopLossLadderProps) {
  const clipId = useId().replace(/:/g, '');

  const { minP, maxP, priceToY, configuredTiers } = useMemo(() => {
    const prices = [currentPrice, ...tiers.map((t) => t.stopPrice).filter((p): p is number => p != null && p > 0)];
    const rawMin = Math.min(...prices);
    const rawMax = Math.max(...prices);
    const pad = (rawMax - rawMin) * 0.12 || rawMax * 0.05 || 1;
    const minP = Math.max(0, rawMin - pad);
    const maxP = rawMax + pad;
    const span = maxP - minP || 1;
    const top = 28;
    const bottom = height - 24;
    const priceToY = (p: number) => bottom - ((p - minP) / span) * (bottom - top);
    const configuredTiers = tiers.filter((t) => t.configured && t.stopPrice != null);
    return { minP, maxP, priceToY, configuredTiers };
  }, [currentPrice, tiers, height]);

  const currentY = priceToY(currentPrice);
  const sortedStops = [...configuredTiers].sort(
    (a, b) => (b.stopPrice ?? 0) - (a.stopPrice ?? 0)
  );

  const labelLayout = useMemo(() => {
    const entries: LabelEntry[] = [
      { key: 'now', baseY: currentY, side: 'left' },
      ...configuredTiers.map((tier) => ({
        key: `stop-${tier.tierId}`,
        baseY: priceToY(tier.stopPrice!),
        side: 'right' as const,
      })),
    ];
    return layoutLabelYs(entries);
  }, [configuredTiers, currentY, priceToY]);

  const nowLayout = labelLayout.get('now');

  return (
    <div className="relative w-full overflow-hidden rounded-xl border bg-gradient-to-b from-muted/40 to-background">
      <svg
        viewBox={`0 0 640 ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Stop-loss price ladder"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={CHART_LEFT} y="20" width={CHART_RIGHT - CHART_LEFT} height={height - 40} rx="4" />
          </clipPath>
          <linearGradient id={`${clipId}-danger`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(220, 38, 38, 0.08)" />
            <stop offset="100%" stopColor="rgba(220, 38, 38, 0.22)" />
          </linearGradient>
        </defs>

        <text
          x="8"
          y={priceToY(maxP) + 4}
          fill="hsl(var(--foreground))"
          fontSize="10"
          fontWeight="500"
          opacity="0.85"
        >
          {formatPrice(maxP)}
        </text>
        <text
          x="8"
          y={priceToY(minP) + 4}
          fill="hsl(var(--foreground))"
          fontSize="10"
          fontWeight="500"
          opacity="0.85"
        >
          {formatPrice(minP)}
        </text>

        <g clipPath={`url(#${clipId})`}>
          {sortedStops.length > 0 && (
            <rect
              x={CHART_LEFT}
              y={priceToY(sortedStops[sortedStops.length - 1].stopPrice!)}
              width={CHART_RIGHT - CHART_LEFT}
              height={height - priceToY(sortedStops[sortedStops.length - 1].stopPrice!)}
              fill={`url(#${clipId}-danger)`}
            />
          )}

          {sortedStops.map((tier, idx) => {
            const stopY = priceToY(tier.stopPrice!);
            const nextY =
              idx < sortedStops.length - 1
                ? priceToY(sortedStops[idx + 1].stopPrice!)
                : height - 24;
            return (
              <rect
                key={`zone-${tier.tierId}`}
                x={CHART_LEFT}
                y={stopY}
                width={CHART_RIGHT - CHART_LEFT}
                height={Math.max(0, nextY - stopY)}
                fill={TIER_FILL[tier.tierId]}
              />
            );
          })}

          {configuredTiers.map((tier) => {
            const y = priceToY(tier.stopPrice!);
            const stroke = TIER_STROKE[tier.tierId];
            const dashed = tier.acknowledged && tier.triggered;
            const alertPulse = tier.activeAlert;
            return (
              <g key={tier.tierId}>
                <line
                  x1={CHART_LEFT}
                  y1={y}
                  x2={CHART_RIGHT}
                  y2={y}
                  stroke={stroke}
                  strokeWidth={alertPulse ? 2.5 : 1.5}
                  strokeDasharray={dashed ? '6 4' : alertPulse ? '0' : '8 4'}
                  opacity={tier.acknowledged && !tier.activeAlert ? 0.45 : 1}
                />
                {alertPulse && (
                  <circle cx={CHART_RIGHT - 16} cy={y} r="5" fill={stroke} className="animate-pulse" />
                )}
              </g>
            );
          })}

          <line
            x1={CHART_LEFT}
            y1={currentY}
            x2={CHART_RIGHT}
            y2={currentY}
            stroke="hsl(var(--foreground))"
            strokeWidth="2.5"
          />
          <polygon
            points={`${CHART_LEFT},${currentY} ${CHART_LEFT + 8},${currentY - 5} ${CHART_LEFT + 8},${currentY + 5}`}
            fill="hsl(var(--foreground))"
          />
        </g>

        {/* Leader lines when a pill was nudged vertically */}
        {nowLayout && Math.abs(nowLayout.y - nowLayout.baseY) > 1.5 && (
          <line
            x1={NOW_PILL.x + NOW_PILL.w}
            y1={nowLayout.y}
            x2={CHART_LEFT + 24}
            y2={nowLayout.baseY}
            stroke="hsl(var(--foreground))"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.45"
          />
        )}
        {configuredTiers.map((tier) => {
          const layout = labelLayout.get(`stop-${tier.tierId}`);
          if (!layout || Math.abs(layout.y - layout.baseY) <= 1.5) return null;
          const stroke = TIER_STROKE[tier.tierId];
          return (
            <line
              key={`lead-${tier.tierId}`}
              x1={STOP_PILL.x}
              y1={layout.y}
              x2={CHART_RIGHT - 20}
              y2={layout.baseY}
              stroke={stroke}
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.55"
            />
          );
        })}

        {/* Now — left pill */}
        {nowLayout && (
          <g>
            <rect
              x={NOW_PILL.x}
              y={nowLayout.y - PILL_H / 2}
              width={NOW_PILL.w}
              height={PILL_H}
              rx="5"
              fill="hsl(var(--foreground))"
            />
            <text
              x={NOW_PILL.x + NOW_PILL.w / 2}
              y={nowLayout.y + 4}
              textAnchor="middle"
              fill="hsl(var(--background))"
              fontSize="10"
              fontWeight="600"
            >
              Now {formatPrice(currentPrice)}
            </text>
          </g>
        )}

        {/* Stops — right pills */}
        {configuredTiers.map((tier) => {
          const y = priceToY(tier.stopPrice!);
          const layout = labelLayout.get(`stop-${tier.tierId}`);
          const pillY = layout?.y ?? y;
          const stroke = TIER_STROKE[tier.tierId];
          const priceLabel = `${formatPrice(tier.stopPrice!)}${
            tier.sellPct != null ? ` · ${tier.sellPct}%` : ''
          }`;
          const muted = tier.acknowledged && tier.triggered && !tier.activeAlert;
          return (
            <g key={`label-${tier.tierId}`} opacity={muted ? 0.55 : 1}>
              <rect
                x={STOP_PILL.x}
                y={pillY - PILL_H / 2}
                width={STOP_PILL.w}
                height={PILL_H}
                rx="5"
                fill="hsl(var(--card))"
                stroke={stroke}
                strokeWidth={tier.activeAlert ? 2.5 : 1.75}
              />
              <rect
                x={STOP_PILL.x}
                y={pillY - PILL_H / 2}
                width="4"
                height={PILL_H}
                rx="2"
                fill={stroke}
              />
              <text x={STOP_PILL.x + 14} y={pillY + 4} fill={stroke} fontSize="10" fontWeight="700">
                {tier.labelZh}
              </text>
              <text
                x={STOP_PILL.x + STOP_PILL.w - 8}
                y={pillY + 4}
                textAnchor="end"
                fill="hsl(var(--foreground))"
                fontSize="10"
                fontWeight="600"
              >
                {priceLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
