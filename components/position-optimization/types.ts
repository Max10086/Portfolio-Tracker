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
