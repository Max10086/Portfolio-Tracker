'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
import type { AssetRow } from './types';

interface TreemapNode {
  name: string;
  size: number;
  pnl: number;
  returnPct: number;
  symbol: string;
  marketType: string;
  fill: string;
}

function pnlToColor(pnl: number, returnPct: number): string {
  if (Math.abs(pnl) < 1) return '#94a3b8';
  const intensity = Math.min(1, Math.abs(returnPct) / 40);
  if (pnl >= 0) {
    const g = Math.round(120 + intensity * 80);
    return `rgb(22, ${g}, 74)`;
  }
  const r = Math.round(180 + intensity * 75);
  return `rgb(${r}, 38, 38)`;
}

interface CustomContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  pnl?: number;
  returnPct?: number;
  fill?: string;
  symbol?: string;
  marketType?: string;
  onSelect?: (symbol: string, marketType: string) => void;
}

function TreemapContent(props: CustomContentProps) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    name,
    pnl = 0,
    returnPct = 0,
    fill,
    symbol,
    marketType,
    onSelect,
  } = props;
  if (width < 4 || height < 4) return null;
  const showLabel = width > 56 && height > 36;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="#fff"
        strokeWidth={2}
        rx={4}
        style={{ cursor: symbol ? 'pointer' : undefined }}
        onClick={() => {
          if (symbol && marketType) onSelect?.(symbol, marketType);
        }}
      />
      {showLabel && (
        <>
          <text x={x + 6} y={y + 16} fill="#fff" fontSize={12} fontWeight={600}>
            {name}
          </text>
          <text x={x + 6} y={y + 32} fill="rgba(255,255,255,0.9)" fontSize={10}>
            {returnPct >= 0 ? '+' : ''}
            {returnPct.toFixed(1)}%
          </text>
        </>
      )}
      {!showLabel && width > 24 && (
        <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="#fff" fontSize={10}>
          {name?.slice(0, 4)}
        </text>
      )}
      <title>{`${name}: PnL ${pnl.toFixed(0)}, return ${returnPct.toFixed(1)}%`}</title>
    </g>
  );
}

interface PositionTreemapViewProps {
  assets: AssetRow[];
  baseCurrency: string;
  onSelectAsset?: (symbol: string, marketType: string) => void;
}

export function PositionTreemapView({ assets, baseCurrency, onSelectAsset }: PositionTreemapViewProps) {
  const data = useMemo((): TreemapNode[] => {
    return assets
      .filter((a) => a.currentValue > 0)
      .map((a) => ({
        name: a.symbol,
        size: a.currentValue,
        pnl: a.totalPnL,
        returnPct: a.returnPct,
        symbol: a.symbol,
        marketType: a.marketType,
        fill: pnlToColor(a.totalPnL, a.returnPct),
      }))
      .sort((a, b) => b.size - a.size);
  }, [assets]);

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No positions with current value to map.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Tile size = current value ({baseCurrency}). Color = total PnL (green gain, red loss). Larger red
        blocks = concentration risk + underwater.
      </p>
      <ResponsiveContainer width="100%" height={480}>
        <Treemap
          data={data}
          dataKey="size"
          aspectRatio={16 / 11}
          stroke="#fff"
          content={<TreemapContent onSelect={onSelectAsset} />}
        >
          <Tooltip
            content={({ payload }) => {
              const row = payload?.[0]?.payload as TreemapNode | undefined;
              if (!row) return null;
              return (
                <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
                  <p className="font-semibold">{row.name}</p>
                  <p>Value: {baseCurrency} {row.size.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                  <p>Total PnL: {baseCurrency} {row.pnl.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                  <p>Return: {row.returnPct.toFixed(1)}%</p>
                </div>
              );
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}
