import { normalizeAssetNameKey } from '@/lib/asset-name-cache';

export interface BreakdownRow {
  key: string;
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;
  currentValue: number;
  trades: number;
  winRate: number;
}

export interface AssetRow {
  symbol: string;
  name: string;
  marketType: string;
  tag: string;
  currentValue: number;
  allocationPct: number;
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;
  costBasis: number;
  investedCapital: number;
  returnPct: number;
  avgHoldingDays: number;
  trades: number;
  winRate: number;
  /** Open position size (0 if flat). */
  quantity?: number;
  /** Last quote in `priceCurrency`. */
  currentPrice?: number;
  priceCurrency?: string;
}

export type StopTierId = 'relief' | 'retreat' | 'bailout';

export interface StopTierConfig {
  price: number | null;
  sellPct: number | null;
}

export interface AssetStopLossConfig {
  relief: StopTierConfig;
  retreat: StopTierConfig;
  bailout: StopTierConfig;
}

export const STOP_TIER_META: Record<
  StopTierId,
  { labelEn: string; labelZh: string; severity: number }
> = {
  relief: { labelEn: 'Relief Stop', labelZh: '降压线', severity: 1 },
  retreat: { labelEn: 'Retreat Stop', labelZh: '撤退线', severity: 2 },
  bailout: { labelEn: 'Bailout Stop', labelZh: '逃生线', severity: 3 },
};

export function assetRowKey(symbol: string, marketType: string): string {
  return normalizeAssetNameKey(symbol, marketType);
}

export interface MonthlyPerformanceRow {
  month: string;
  realizedPnL: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface ClosedTradeRow {
  symbol: string;
  marketType: string;
  tag: string;
  quantity: number;
  pnl: number;
  returnPct: number;
  holdingDays: number;
  closedAt: string;
}

export interface BehaviorStats {
  avgHoldingDaysWinner: number;
  avgHoldingDaysLoser: number;
  maxLossStreak: number;
  trades30d: number;
}

export type PnlMetric = 'realized' | 'unrealized' | 'total';
export type AttributionDimension = 'tag' | 'market' | 'asset';
