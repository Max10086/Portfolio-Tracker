import type { ChecklistAnswer, GatekeeperDirection } from '@/lib/gatekeeper-checklist';

export const GATEKEEPER_DRAFT_STORAGE_KEY = 'portfolio-gatekeeper-draft-v1';

export interface GatekeeperCalculatorState {
  equity: string;
  entryPrice: string;
  stopPrice: string;
  targetPrice: string;
  maxRiskPreset: '0.5' | '0.1' | '0.2' | 'custom';
  maxRiskCustomPct: string;
  plannedQuantity: string;
}

/** Minimum reward/risk (profit vs loss per share) to consider entry worthwhile — 5:1 = 500%. */
export const REWARD_RISK_MIN_RATIO = 5;

export interface GatekeeperDraft {
  direction: GatekeeperDirection;
  symbol: string;
  marketType: string;
  answers: Record<string, ChecklistAnswer>;
  calculator: GatekeeperCalculatorState;
  updatedAt: string;
}

export function defaultCalculator(equityDefault = ''): GatekeeperCalculatorState {
  return {
    equity: equityDefault,
    entryPrice: '',
    stopPrice: '',
    targetPrice: '',
    maxRiskPreset: '0.5',
    maxRiskCustomPct: '',
    plannedQuantity: '',
  };
}

export function defaultDraft(equityDefault = ''): GatekeeperDraft {
  return {
    direction: 'BUY',
    symbol: '',
    marketType: '',
    answers: {},
    calculator: defaultCalculator(equityDefault),
    updatedAt: new Date().toISOString(),
  };
}

export function loadGatekeeperDraft(): GatekeeperDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GATEKEEPER_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as GatekeeperDraft;
    const preset = draft.calculator?.maxRiskPreset as string | undefined;
    if (preset === '1') draft.calculator.maxRiskPreset = '0.1';
    else if (preset === '2') draft.calculator.maxRiskPreset = '0.2';
    return draft;
  } catch {
    return null;
  }
}

export function saveGatekeeperDraft(draft: GatekeeperDraft): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      GATEKEEPER_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...draft, updatedAt: new Date().toISOString() })
    );
  } catch {
    // ignore
  }
}

export function clearGatekeeperDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(GATEKEEPER_DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function resolveMaxRiskPct(calc: GatekeeperCalculatorState): number {
  if (calc.maxRiskPreset === 'custom') {
    const n = Number(calc.maxRiskCustomPct);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return Number(calc.maxRiskPreset);
}

const FIRST_TRANCHE_RATIO = 0.3;

export function computeRiskMetrics(calc: GatekeeperCalculatorState): {
  maxRiskPct: number;
  maxRiskAmount: number | null;
  suggestedQuantity: number | null;
  suggestedQuantityMaxInt: number | null;
  firstTrancheQuantityInt: number | null;
  plannedRiskPct: number | null;
  plannedRiskAmount: number | null;
  riskPerShare: number | null;
} {
  const equity = Number(calc.equity);
  const entry = Number(calc.entryPrice);
  const stop = Number(calc.stopPrice);
  const maxRiskPct = resolveMaxRiskPct(calc);
  const maxRiskAmount =
    Number.isFinite(equity) && equity > 0 && maxRiskPct > 0
      ? (equity * maxRiskPct) / 100
      : null;
  const riskPerShare =
    Number.isFinite(entry) && Number.isFinite(stop) && entry > 0 && stop > 0 && entry !== stop
      ? Math.abs(entry - stop)
      : null;
  const suggestedQuantityRaw =
    maxRiskAmount != null && riskPerShare != null && riskPerShare > 0
      ? maxRiskAmount / riskPerShare
      : null;
  const suggestedQuantity = suggestedQuantityRaw;
  const suggestedQuantityMaxInt =
    suggestedQuantityRaw != null && suggestedQuantityRaw > 0
      ? Math.floor(suggestedQuantityRaw)
      : null;
  const firstTrancheQuantityInt =
    suggestedQuantityMaxInt != null && suggestedQuantityMaxInt > 0
      ? Math.max(1, Math.floor(suggestedQuantityMaxInt * FIRST_TRANCHE_RATIO))
      : null;
  const plannedQty = Number(calc.plannedQuantity);
  const plannedRiskAmount =
    Number.isFinite(plannedQty) && plannedQty > 0 && riskPerShare != null
      ? plannedQty * riskPerShare
      : null;
  const plannedRiskPct =
    plannedRiskAmount != null && Number.isFinite(equity) && equity > 0
      ? (plannedRiskAmount / equity) * 100
      : null;

  return {
    maxRiskPct,
    maxRiskAmount,
    suggestedQuantity,
    suggestedQuantityMaxInt,
    firstTrancheQuantityInt,
    plannedRiskPct,
    plannedRiskAmount,
    riskPerShare,
  };
}

export function computeRewardRiskMetrics(calc: GatekeeperCalculatorState): {
  rewardPerShare: number | null;
  riskPerShare: number | null;
  rewardRiskRatio: number | null;
  rewardRiskPct: number | null;
  meetsMinimum: boolean;
  validGeometry: boolean;
} {
  const entry = Number(calc.entryPrice);
  const stop = Number(calc.stopPrice);
  const target = Number(calc.targetPrice);

  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(stop) ||
    !Number.isFinite(target) ||
    entry <= 0 ||
    stop <= 0 ||
    target <= 0
  ) {
    return {
      rewardPerShare: null,
      riskPerShare: null,
      rewardRiskRatio: null,
      rewardRiskPct: null,
      meetsMinimum: false,
      validGeometry: false,
    };
  }

  const riskPerShare = entry - stop;
  const rewardPerShare = target - entry;
  const validGeometry = riskPerShare > 0 && rewardPerShare > 0;

  if (!validGeometry) {
    return {
      rewardPerShare: rewardPerShare > 0 ? rewardPerShare : null,
      riskPerShare: riskPerShare > 0 ? riskPerShare : null,
      rewardRiskRatio: null,
      rewardRiskPct: null,
      meetsMinimum: false,
      validGeometry: false,
    };
  }

  const rewardRiskRatio = rewardPerShare / riskPerShare;
  const rewardRiskPct = rewardRiskRatio * 100;

  return {
    rewardPerShare,
    riskPerShare,
    rewardRiskRatio,
    rewardRiskPct,
    meetsMinimum: rewardRiskRatio >= REWARD_RISK_MIN_RATIO,
    validGeometry: true,
  };
}

export interface QuantityPnlScenario {
  id: 'max' | 'planned';
  label: string;
  quantity: number;
  profitAtTarget: number;
  lossAtStop: number;
}

export function buildQuantityPnlScenarios(
  calc: GatekeeperCalculatorState,
  suggestedQuantityMaxInt: number | null,
  rewardPerShare: number,
  riskPerShare: number
): QuantityPnlScenario[] {
  const scenarios: QuantityPnlScenario[] = [];

  if (suggestedQuantityMaxInt != null && suggestedQuantityMaxInt > 0) {
    scenarios.push({
      id: 'max',
      label: '建议最大数量',
      quantity: suggestedQuantityMaxInt,
      profitAtTarget: suggestedQuantityMaxInt * rewardPerShare,
      lossAtStop: suggestedQuantityMaxInt * riskPerShare,
    });
  }

  const planned = Number(calc.plannedQuantity);
  if (Number.isFinite(planned) && planned > 0) {
    scenarios.push({
      id: 'planned',
      label: '计划买入数量',
      quantity: planned,
      profitAtTarget: planned * rewardPerShare,
      lossAtStop: planned * riskPerShare,
    });
  }

  return scenarios;
}
