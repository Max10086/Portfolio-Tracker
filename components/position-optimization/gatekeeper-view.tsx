'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, ExternalLink, Layers } from 'lucide-react';
import { GatekeeperVerdictBanner } from './gatekeeper-verdict-banner';
import { GatekeeperChecklistRail } from './gatekeeper-checklist-rail';
import type { AssetRow } from './types';
import { assetRowKey } from './types';
import {
  checklistItemsForDirection,
  checklistVersionForDirection,
  countAnswered,
  evaluatePassed,
  type ChecklistAnswer,
  type GatekeeperDirection,
} from '@/lib/gatekeeper-checklist';
import {
  computeRiskMetrics,
  computeRewardRiskMetrics,
  buildQuantityPnlScenarios,
  REWARD_RISK_MIN_RATIO,
  clearGatekeeperDraft,
  defaultDraft,
  loadGatekeeperDraft,
  saveGatekeeperDraft,
  type GatekeeperDraft,
} from '@/lib/gatekeeper-config';
import {
  fetchGatekeeperSessionsRemote,
  saveGatekeeperSessionRemote,
} from '@/lib/gatekeeper-client';
import type { GatekeeperSessionRow } from '@/lib/gatekeeper-db';
import { stashGatekeeperTradePrefill } from '@/lib/gatekeeper-prefill';
import { isAssetEligibleForStopLoss } from '@/lib/stop-loss-config';
import type { MarketType } from '@/lib/price-service';
import {
  currencySymbol,
  formatMoneyWithSymbol,
  quoteCurrencyForMarket,
  type QuoteCurrency,
} from '@/lib/market-currency';

interface GatekeeperViewProps {
  assets: AssetRow[];
  assetNameByKey?: Record<string, string>;
  defaultEquity: number;
  baseCurrency: string;
}

const MARKET_OPTIONS: MarketType[] = ['US', 'CN', 'HK', 'CRYPTO'];

function formatPerSharePrice(amount: number, currency: string): string {
  return `${currencySymbol(currency)}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
}

/** Same numeric equity in the wrong quote currency is often off by FX (~7x for USD/CNY). */
function equityLikelyWrongQuote(equityStr: string, expectedStr: string): boolean {
  const a = Number(equityStr);
  const b = Number(expectedStr);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0 || a <= 0) return false;
  const ratio = a / b;
  return ratio > 2.5 || ratio < 0.2;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

export function GatekeeperView({
  assets,
  assetNameByKey = {},
  defaultEquity,
  baseCurrency,
}: GatekeeperViewProps) {
  const equityDefaultStr =
    defaultEquity > 0
      ? String(Math.round(defaultEquity * 100) / 100)
      : '';

  const [draft, setDraft] = useState<GatekeeperDraft>(() => {
    const stored = loadGatekeeperDraft();
    if (stored) return stored;
    return defaultDraft(equityDefaultStr);
  });
  const [tableReady, setTableReady] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<GatekeeperSessionRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [assetPick, setAssetPick] = useState<string>('manual');
  const [fxRate, setFxRate] = useState(1);
  const prevCalcCurrencyRef = useRef<QuoteCurrency | null>(null);
  const lastAutoEquityRef = useRef('');
  const equityUserEditedRef = useRef(false);

  const calcCurrency = useMemo((): QuoteCurrency => {
    if (!draft.marketType.trim()) {
      if (baseCurrency === 'CNY' || baseCurrency === 'HKD' || baseCurrency === 'USD') {
        return baseCurrency;
      }
      return 'USD';
    }
    return quoteCurrencyForMarket(draft.marketType);
  }, [draft.marketType, baseCurrency]);

  useEffect(() => {
    let cancelled = false;
    if (calcCurrency === baseCurrency) {
      setFxRate(1);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(
          `/api/exchange-rate?from=${encodeURIComponent(baseCurrency)}&to=${encodeURIComponent(calcCurrency)}`,
          { cache: 'no-store' }
        );
        const data = (await res.json()) as { rate?: number };
        if (!cancelled && typeof data.rate === 'number') setFxRate(data.rate);
      } catch {
        if (!cancelled) setFxRate(1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseCurrency, calcCurrency]);

  const portfolioEquityInQuote = useMemo(() => {
    if (defaultEquity <= 0) return '';
    const amount =
      calcCurrency === baseCurrency ? defaultEquity : defaultEquity * fxRate;
    return String(Math.round(amount * 100) / 100);
  }, [defaultEquity, calcCurrency, baseCurrency, fxRate]);

  /** Avoid writing converted equity while rate is still the initial placeholder (1). */
  const fxReadyForQuote =
    calcCurrency === baseCurrency || fxRate !== 1;

  const pickableAssets = useMemo(
    () =>
      assets.filter(
        (a) =>
          isAssetEligibleForStopLoss(a.symbol, a.marketType) &&
          (a.quantity ?? 0) > 0 &&
          a.marketType !== 'CASH'
      ),
    [assets]
  );

  useEffect(() => {
    const market = draft.marketType.trim().toUpperCase();

    if (!market) {
      prevCalcCurrencyRef.current = null;
      if (!draft.calculator.equity && equityDefaultStr) {
        setDraft((d) => ({
          ...d,
          calculator: { ...d.calculator, equity: equityDefaultStr },
        }));
        lastAutoEquityRef.current = equityDefaultStr;
      }
      return;
    }

    const prevCurrency = prevCalcCurrencyRef.current;
    const currencyChanged =
      prevCurrency !== null && prevCurrency !== calcCurrency;
    const initialMarketAttach = prevCurrency === null && !!market;
    prevCalcCurrencyRef.current = calcCurrency;

    if (!fxReadyForQuote || !portfolioEquityInQuote) return;

    const applyPortfolioEquity = () => {
      equityUserEditedRef.current = false;
      setDraft((d) => ({
        ...d,
        calculator: { ...d.calculator, equity: portfolioEquityInQuote },
      }));
      lastAutoEquityRef.current = portfolioEquityInQuote;
    };

    if (currencyChanged) {
      applyPortfolioEquity();
      return;
    }

    const eq = draft.calculator.equity.trim();

    if (!eq) {
      applyPortfolioEquity();
      return;
    }

    if (equityUserEditedRef.current) return;

    if (
      initialMarketAttach &&
      equityLikelyWrongQuote(eq, portfolioEquityInQuote)
    ) {
      applyPortfolioEquity();
      return;
    }

    const looksAutoFilled =
      eq === lastAutoEquityRef.current || eq === equityDefaultStr;

    if (looksAutoFilled && eq !== portfolioEquityInQuote) {
      applyPortfolioEquity();
    }
  }, [
    draft.marketType,
    calcCurrency,
    portfolioEquityInQuote,
    fxReadyForQuote,
    equityDefaultStr,
    draft.calculator.equity,
  ]);

  useEffect(() => {
    saveGatekeeperDraft(draft);
  }, [draft]);

  const items = useMemo(
    () => checklistItemsForDirection(draft.direction),
    [draft.direction]
  );

  const progress = useMemo(
    () => countAnswered(draft.direction, draft.answers),
    [draft.direction, draft.answers]
  );

  const passed = useMemo(
    () => evaluatePassed(draft.direction, draft.answers),
    [draft.direction, draft.answers]
  );

  const checklistComplete = progress.answered >= progress.total && progress.total > 0;

  const failedItems = useMemo(
    () => items.filter((item) => draft.answers[item.id] === 'no'),
    [items, draft.answers]
  );

  const riskMetrics = useMemo(
    () =>
      draft.direction === 'BUY' ? computeRiskMetrics(draft.calculator) : null,
    [draft.direction, draft.calculator]
  );

  const rewardRiskMetrics = useMemo(
    () =>
      draft.direction === 'BUY' ? computeRewardRiskMetrics(draft.calculator) : null,
    [draft.direction, draft.calculator]
  );

  const quantityPnlScenarios = useMemo(() => {
    if (
      !rewardRiskMetrics?.validGeometry ||
      rewardRiskMetrics.rewardPerShare == null ||
      rewardRiskMetrics.riskPerShare == null
    ) {
      return [];
    }
    return buildQuantityPnlScenarios(
      draft.calculator,
      riskMetrics?.suggestedQuantityMaxInt ?? null,
      rewardRiskMetrics.rewardPerShare,
      rewardRiskMetrics.riskPerShare
    );
  }, [draft.calculator, rewardRiskMetrics, riskMetrics?.suggestedQuantityMaxInt]);

  const riskExceedsMax =
    riskMetrics?.plannedRiskPct != null &&
    riskMetrics.maxRiskPct > 0 &&
    riskMetrics.plannedRiskPct > riskMetrics.maxRiskPct + 1e-6;

  useEffect(() => {
    if (draft.direction !== 'BUY' || !riskExceedsMax) return;
    if (draft.answers.buy_risk_max_risk === 'yes') {
      setDraft((d) => ({
        ...d,
        answers: { ...d.answers, buy_risk_max_risk: 'no' },
      }));
    }
  }, [riskExceedsMax, draft.direction, draft.answers.buy_risk_max_risk]);

  const loadHistory = useCallback(async () => {
    if (!draft.symbol.trim() || !draft.marketType) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const payload = await fetchGatekeeperSessionsRemote({
        symbol: draft.symbol.trim(),
        market_type: draft.marketType,
        limit: 20,
      });
      setTableReady(payload.tableReady);
      setHistory(payload.sessions);
      setSyncError(null);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : '加载历史失败');
    } finally {
      setHistoryLoading(false);
    }
  }, [draft.symbol, draft.marketType]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const setAnswer = (id: string, value: ChecklistAnswer) => {
    setDraft((d) => ({
      ...d,
      answers: { ...d.answers, [id]: value },
    }));
  };

  const updateCalculator = (patch: Partial<GatekeeperDraft['calculator']>) => {
    setDraft((d) => ({
      ...d,
      calculator: { ...d.calculator, ...patch },
    }));
  };

  const handleAssetPick = (key: string) => {
    setAssetPick(key);
    if (key === 'manual') return;
    const asset = pickableAssets.find((a) => assetRowKey(a.symbol, a.marketType) === key);
    if (!asset) return;
    setDraft((d) => ({
      ...d,
      symbol: asset.symbol,
      marketType: asset.marketType,
      calculator: {
        ...d.calculator,
        entryPrice:
          asset.currentPrice != null && asset.currentPrice > 0
            ? String(asset.currentPrice)
            : d.calculator.entryPrice,
      },
    }));
  };

  const buildPayload = (savedWithoutOrder: boolean) => {
    const symbol = draft.symbol.trim().toUpperCase();
    const market_type = draft.marketType.trim().toUpperCase();
    const calcSnapshot =
      draft.direction === 'BUY'
        ? {
            ...draft.calculator,
            ...riskMetrics,
            quoteCurrency: calcCurrency,
            portfolioBaseCurrency: baseCurrency,
            fxRateToQuote: calcCurrency === baseCurrency ? 1 : fxRate,
          }
        : null;
    return {
      symbol,
      market_type,
      direction: draft.direction,
      checklist_version: checklistVersionForDirection(draft.direction),
      answers: draft.answers,
      calculator: calcSnapshot,
      passed,
      saved_without_order: savedWithoutOrder,
    };
  };

  const validateTarget = (): boolean => {
    if (!draft.symbol.trim() || !draft.marketType) {
      setSyncError('请先选择或填写标的（代码 + 市场）');
      return false;
    }
    if (progress.answered < progress.total) {
      setSyncError('请完成全部自查项（每项选「是」或「否」）');
      return false;
    }
    return true;
  };

  const persistSession = async (savedWithoutOrder: boolean) => {
    if (!validateTarget()) return;
    setSaveMessage(null);
    try {
      const result = await saveGatekeeperSessionRemote(buildPayload(savedWithoutOrder));
      setTableReady(result.tableReady);
      if (!result.tableReady) {
        setSyncError('云端未就绪：请在 Supabase 执行 008_gatekeeper_sessions.sql');
        return;
      }
      setSyncError(null);
      setSaveMessage(savedWithoutOrder ? '已保存本次自查' : '已记录并通过 Gatekeeper，正在打开下单…');
      await loadHistory();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleSaveOnly = () => void persistSession(true);

  const handleGoTrade = () => {
    if (!passed) {
      setSyncError('尚未全部通过：请修正选「否」的项，或在 Tab 内完成自查后再前往下单');
      return;
    }
    if (!validateTarget()) return;

    void (async () => {
      await persistSession(false);
      if (!passed) return;

      const qty =
        draft.direction === 'BUY'
          ? draft.calculator.plannedQuantity.trim() ||
            (riskMetrics?.firstTrancheQuantityInt != null
              ? String(riskMetrics.firstTrancheQuantityInt)
              : '')
          : undefined;
      const qtyFinal = qty && qty.length > 0 ? qty : undefined;
      const price =
        draft.direction === 'BUY' && draft.calculator.entryPrice.trim()
          ? draft.calculator.entryPrice.trim()
          : undefined;

      stashGatekeeperTradePrefill({
        marketType: draft.marketType.trim().toUpperCase() as MarketType,
        symbol: draft.symbol.trim().toUpperCase(),
        transactionType: draft.direction,
        quantity: qtyFinal,
        pricePerUnit: price,
      });

      document.getElementById('portfolio-holdings-card')?.scrollIntoView({ behavior: 'smooth' });
    })();
  };

  const resetDraft = () => {
    const equityForReset = portfolioEquityInQuote || equityDefaultStr;
    const next = defaultDraft(equityForReset);
    next.direction = draft.direction;
    equityUserEditedRef.current = false;
    lastAutoEquityRef.current = equityForReset;
    prevCalcCurrencyRef.current = calcCurrency;
    setDraft(next);
    setAssetPick('manual');
    clearGatekeeperDraft();
    saveGatekeeperDraft(next);
    setSaveMessage(null);
    setSyncError(null);
  };

  const groupedItems = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const list = map.get(item.group) || [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [items]);

  const displayName =
    draft.symbol && draft.marketType
      ? assetNameByKey[assetRowKey(draft.symbol, draft.marketType)] || draft.symbol
      : '';

  return (
    <div className="space-y-6">
      {!tableReady && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
          云端历史未就绪：请在 Supabase SQL Editor 运行{' '}
          <code className="text-xs">008_gatekeeper_sessions.sql</code>。本地草稿仍可用。
        </p>
      )}
      {syncError && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-900 dark:text-red-100">
          {syncError}
        </p>
      )}
      {saveMessage && (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
          {saveMessage}
        </p>
      )}

      <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label className="text-xs text-muted-foreground">方向</Label>
          <Select
            value={draft.direction}
            onValueChange={(v) =>
              setDraft((d) => ({
                ...defaultDraft(d.calculator.equity || equityDefaultStr),
                direction: v as GatekeeperDirection,
                symbol: d.symbol,
                marketType: d.marketType,
                calculator: d.calculator,
              }))
            }
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BUY">买入 / 加仓</SelectItem>
              <SelectItem value="SELL">卖出 / 减仓</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs text-muted-foreground">标的</Label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={assetPick} onValueChange={handleAssetPick}>
              <SelectTrigger className="h-9 w-full sm:min-w-[10rem] sm:max-w-[14rem] sm:flex-shrink-0">
                <SelectValue placeholder="选择持仓" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">手动输入</SelectItem>
                {pickableAssets.map((a) => {
                  const key = assetRowKey(a.symbol, a.marketType);
                  const name = assetNameByKey[key] || a.name || a.symbol;
                  return (
                    <SelectItem key={key} value={key}>
                      {name} ({a.symbol} · {a.marketType})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Input
                placeholder="代码"
                className="h-9 min-w-0 flex-1"
                value={draft.symbol}
                onChange={(e) => {
                  setAssetPick('manual');
                  setDraft((d) => ({ ...d, symbol: e.target.value.toUpperCase() }));
                }}
              />
              <Select
                value={draft.marketType || undefined}
                onValueChange={(v) => {
                  setAssetPick('manual');
                  setDraft((d) => ({ ...d, marketType: v }));
                }}
              >
                <SelectTrigger className="h-9 w-[5.5rem] shrink-0">
                  <SelectValue placeholder="市场" />
                </SelectTrigger>
                <SelectContent>
                  {MARKET_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {displayName && displayName !== draft.symbol && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{displayName}</p>
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">进度</Label>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {progress.answered}/{progress.total}
          </p>
          <p className="text-xs text-muted-foreground">
            {checklistComplete ? '已全部作答' : '完成全部题目后见下方结论'}
          </p>
        </div>
      </div>

      {!checklistComplete && (
        <GatekeeperVerdictBanner
          complete={false}
          passed={false}
          directionLabel={draft.direction === 'BUY' ? '买入 / 加仓' : '卖出 / 减仓'}
          targetLabel={
            draft.symbol && draft.marketType
              ? `${displayName || draft.symbol} (${draft.marketType})`
              : ''
          }
          failedItems={failedItems}
          answered={progress.answered}
          total={progress.total}
        />
      )}

      {draft.direction === 'BUY' && (
        <div className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-2 xl:items-stretch">
        <section className="flex h-full flex-col rounded-xl border bg-muted/20 p-4">
          <h3 className="text-sm font-semibold">风控计算器</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            账户权益默认取组合当前市值
            {calcCurrency !== baseCurrency
              ? `（由 ${baseCurrency} 按汇率换算为 ${calcCurrency}）`
              : `（${baseCurrency}）`}
            ，可修改。入场/止损/目标价与金额均按标的报价货币 {calcCurrency} 计算。Max Risk 默认 0.5%。
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">账户权益 ({calcCurrency})</Label>
              <Input
                className="mt-1 h-9"
                inputMode="decimal"
                value={draft.calculator.equity}
                onChange={(e) => {
                  equityUserEditedRef.current = true;
                  updateCalculator({ equity: e.target.value });
                }}
              />
            </div>
            <div>
              <Label className="text-xs">入场价 ({calcCurrency})</Label>
              <Input
                className="mt-1 h-9"
                inputMode="decimal"
                value={draft.calculator.entryPrice}
                onChange={(e) => updateCalculator({ entryPrice: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">止损价 ({calcCurrency})</Label>
              <Input
                className="mt-1 h-9"
                inputMode="decimal"
                value={draft.calculator.stopPrice}
                onChange={(e) => updateCalculator({ stopPrice: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Max Risk</Label>
              <Select
                value={draft.calculator.maxRiskPreset}
                onValueChange={(v) =>
                  updateCalculator({
                    maxRiskPreset: v as GatekeeperDraft['calculator']['maxRiskPreset'],
                  })
                }
              >
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5">0.5%</SelectItem>
                  <SelectItem value="0.1">0.1%</SelectItem>
                  <SelectItem value="0.2">0.2%</SelectItem>
                  <SelectItem value="custom">自定义</SelectItem>
                </SelectContent>
              </Select>
              {draft.calculator.maxRiskPreset === 'custom' && (
                <Input
                  className="mt-1 h-9"
                  placeholder="自定义 %"
                  inputMode="decimal"
                  value={draft.calculator.maxRiskCustomPct}
                  onChange={(e) => updateCalculator({ maxRiskCustomPct: e.target.value })}
                />
              )}
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">计划买入数量</Label>
              <Input
                className="mt-1 h-9"
                inputMode="decimal"
                value={draft.calculator.plannedQuantity}
                onChange={(e) => updateCalculator({ plannedQuantity: e.target.value })}
              />
            </div>
          </div>
          {riskMetrics && (
            <div className="mt-4 flex flex-1 flex-col gap-4">
              <div className="grid flex-1 gap-3 md:grid-cols-2 md:content-start">
                <div className="flex min-h-[8.5rem] flex-col rounded-xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-background p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                    允许最大亏损（上限）
                  </p>
                  <p className="mt-2 text-3xl font-black tabular-nums text-emerald-950 dark:text-emerald-50">
                    {riskMetrics.maxRiskAmount != null
                      ? formatMoneyWithSymbol(riskMetrics.maxRiskAmount, calcCurrency)
                      : '—'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    占账户权益{' '}
                    <span className="font-bold text-foreground">{riskMetrics.maxRiskPct}%</span>
                    {riskMetrics.maxRiskAmount == null && ' · 请填写权益与 Max Risk'}
                  </p>
                </div>
                <div
                  className={`flex min-h-[8.5rem] flex-col rounded-xl border-2 p-4 ${
                    riskExceedsMax
                      ? 'border-red-500/50 bg-gradient-to-br from-red-500/15 to-background'
                      : riskMetrics.plannedRiskPct != null
                        ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-background'
                        : 'border-muted bg-muted/20'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    本笔计划风险
                  </p>
                  {riskMetrics.plannedRiskPct != null && riskMetrics.plannedRiskAmount != null ? (
                    <>
                      <p
                        className={`mt-2 text-3xl font-black tabular-nums ${
                          riskExceedsMax ? 'text-red-600' : 'text-foreground'
                        }`}
                      >
                        {formatMoneyWithSymbol(riskMetrics.plannedRiskAmount, calcCurrency)}
                      </p>
                      <p className="mt-1 text-sm">
                        占权益{' '}
                        <span
                          className={`text-lg font-black tabular-nums ${
                            riskExceedsMax ? 'text-red-600' : 'text-foreground'
                          }`}
                        >
                          {riskMetrics.plannedRiskPct.toFixed(2)}%
                        </span>
                        <span className="text-muted-foreground">
                          {' '}
                          / 上限 {riskMetrics.maxRiskPct}%
                        </span>
                      </p>
                      {riskExceedsMax && (
                        <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">
                          已超过 Max Risk — 第 7 项应选「否」或减小计划买入数量。
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      填写「计划买入数量」后，这里会对比允许最大亏损是否超标。
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs font-medium text-muted-foreground">建议最大数量（整股/整单位）</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {riskMetrics.suggestedQuantityMaxInt != null
                      ? riskMetrics.suggestedQuantityMaxInt.toLocaleString('en-US')
                      : '—'}
                  </p>
                  {riskMetrics.suggestedQuantityMaxInt != null &&
                    Number(draft.calculator.entryPrice) > 0 && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        买入成本约{' '}
                        {formatMoneyWithSymbol(
                          riskMetrics.suggestedQuantityMaxInt * Number(draft.calculator.entryPrice),
                          calcCurrency
                        )}
                      </p>
                    )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    按 Max Risk ÷ |入场 − 止损| 向下取整；分批总上限参考此值。
                  </p>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs font-medium text-muted-foreground">首次建仓建议（约 30%）</p>
                  <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
                    <p className="text-2xl font-bold tabular-nums text-primary">
                      {riskMetrics.firstTrancheQuantityInt != null
                        ? riskMetrics.firstTrancheQuantityInt.toLocaleString('en-US')
                        : '—'}
                    </p>
                    {riskMetrics.firstTrancheQuantityInt != null && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8"
                        onClick={() =>
                          updateCalculator({
                            plannedQuantity: String(riskMetrics.firstTrancheQuantityInt),
                          })
                        }
                      >
                        <Layers className="mr-1.5 h-3.5 w-3.5" />
                        填入计划数量
                      </Button>
                    )}
                  </div>
                  {riskMetrics.firstTrancheQuantityInt != null &&
                    Number(draft.calculator.entryPrice) > 0 && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        买入成本约{' '}
                        {formatMoneyWithSymbol(
                          riskMetrics.firstTrancheQuantityInt * Number(draft.calculator.entryPrice),
                          calcCurrency
                        )}
                      </p>
                    )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    分批进场，首笔用小仓位验证逻辑，降低一买入就被套的风险。
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="flex h-full flex-col rounded-xl border bg-muted/20 p-4">
          <h3 className="text-sm font-semibold">盈亏计算器</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            与左侧共用「入场价」「止损价」。输入目标价后计算盈亏比（潜在盈利 ÷ 潜在亏损）；建议 ≥
            {REWARD_RISK_MIN_RATIO * 100}%（{REWARD_RISK_MIN_RATIO}:1）再考虑建仓。
          </p>
          <div className="mt-3">
            <Label className="text-xs">目标价 ({calcCurrency})</Label>
            <Input
              className="mt-1 h-9"
              inputMode="decimal"
              placeholder="止盈或预期卖出价"
              value={draft.calculator.targetPrice}
              onChange={(e) => updateCalculator({ targetPrice: e.target.value })}
            />
          </div>
          {rewardRiskMetrics && (
            <div className="mt-4 flex flex-1 flex-col gap-3">
              <div
                className={`flex min-h-[8.5rem] flex-1 flex-col rounded-xl border-2 p-4 ${
                  rewardRiskMetrics.rewardRiskPct != null
                    ? rewardRiskMetrics.meetsMinimum
                      ? 'border-emerald-500/45 bg-gradient-to-br from-emerald-500/10 to-background'
                      : 'border-amber-500/45 bg-gradient-to-br from-amber-500/10 to-background'
                    : 'border-muted bg-muted/20'
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  盈亏比
                </p>
                {rewardRiskMetrics.validGeometry &&
                rewardRiskMetrics.rewardRiskPct != null ? (
                  <>
                    <p
                      className={`mt-2 text-4xl font-black tabular-nums ${
                        rewardRiskMetrics.meetsMinimum ? 'text-emerald-600' : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {rewardRiskMetrics.rewardRiskPct.toFixed(0)}%
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      约 {rewardRiskMetrics.rewardRiskRatio!.toFixed(2)} : 1（每承担 1 单位风险，目标对应{' '}
                      {rewardRiskMetrics.rewardRiskRatio!.toFixed(2)} 单位盈利）
                    </p>
                    <p
                      className={`mt-2 text-sm font-semibold ${
                        rewardRiskMetrics.meetsMinimum ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-200'
                      }`}
                    >
                      {rewardRiskMetrics.meetsMinimum
                        ? `≥ ${REWARD_RISK_MIN_RATIO * 100}% — 盈亏结构值得考虑`
                        : `< ${REWARD_RISK_MIN_RATIO * 100}% — 赔率偏低，谨慎建仓或提高目标/收紧止损`}
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    请填写入场价、止损价（止损 &lt; 入场）与目标价（目标 &gt; 入场）以计算盈亏比。
                  </p>
                )}
              </div>
              {rewardRiskMetrics.validGeometry && (
                <div className="mt-auto grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg border bg-card px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">每股潜在亏损</p>
                    <p className="font-bold tabular-nums text-red-600">
                      {formatPerSharePrice(rewardRiskMetrics.riskPerShare!, calcCurrency)}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-card px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">每股潜在盈利</p>
                    <p className="font-bold tabular-nums text-emerald-600">
                      {formatPerSharePrice(rewardRiskMetrics.rewardPerShare!, calcCurrency)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
        </div>

        {rewardRiskMetrics && (
          <section className="rounded-xl border bg-muted/20 p-4">
            <p className="text-sm font-semibold">按数量测算金额</p>
            <p className="mt-1 text-xs text-muted-foreground">
              结合风控与盈亏计算器：按「建议最大数量」与「计划买入数量」，估算触达目标价盈利 / 触达止损价亏损（{calcCurrency}）。
            </p>
            {!rewardRiskMetrics.validGeometry ? (
              <p className="mt-3 text-sm text-muted-foreground">
                请先填写入场价、止损价（止损 &lt; 入场）与目标价（目标 &gt; 入场）。
              </p>
            ) : quantityPnlScenarios.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                请填写 Max Risk 与入场/止损以得到建议最大数量，或填写计划买入数量。
              </p>
            ) : (
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {quantityPnlScenarios.map((row) => (
                  <li key={row.id} className="rounded-lg border bg-card p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium">{row.label}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {row.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })} 单位
                      </p>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                        <p className="text-[10px] font-medium text-emerald-800 dark:text-emerald-200">
                          达目标价盈利
                        </p>
                        <p className="mt-0.5 text-xl font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                          +{formatMoneyWithSymbol(row.profitAtTarget, calcCurrency)}
                        </p>
                      </div>
                      <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2">
                        <p className="text-[10px] font-medium text-red-800 dark:text-red-200">
                          触止损价亏损
                        </p>
                        <p className="mt-0.5 text-xl font-black tabular-nums text-red-600">
                          −{formatMoneyWithSymbol(row.lossAtStop, calcCurrency)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        </div>
      )}

      <GatekeeperChecklistRail
        steps={groupedItems}
        answers={draft.answers}
        onAnswer={setAnswer}
        directionKey={`${draft.direction}-${checklistVersionForDirection(draft.direction)}`}
      />

      {checklistComplete && (
        <GatekeeperVerdictBanner
          complete={checklistComplete}
          passed={passed}
          directionLabel={draft.direction === 'BUY' ? '买入 / 加仓' : '卖出 / 减仓'}
          targetLabel={
            draft.symbol && draft.marketType
              ? `${displayName || draft.symbol} (${draft.marketType})`
              : ''
          }
          failedItems={failedItems}
          answered={progress.answered}
          total={progress.total}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={resetDraft}>
          重置本次
        </Button>
        <Button type="button" variant="outline" onClick={handleSaveOnly}>
          <Save className="mr-2 h-4 w-4" />
          保存本次自查（未下单）
        </Button>
        <Button
          type="button"
          disabled={!passed}
          size="lg"
          className={
            passed
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : undefined
          }
          onClick={handleGoTrade}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          {passed ? '继续 · 前往下单' : '已中止 · 无法下单'}
        </Button>
      </div>
      {checklistComplete && !passed && (
        <p className="text-center text-sm font-medium text-red-600">
          Gatekeeper 结论：ABORT — 请修正上述「否」项后再试；Portfolio 区 Add Transaction 仍可手动打开。
        </p>
      )}
      {checklistComplete && passed && (
        <p className="text-center text-sm font-medium text-emerald-700 dark:text-emerald-300">
          Gatekeeper 结论：GO — 可以按纪律执行；建议优先使用首次建仓数量分批买入。
        </p>
      )}

      <section className="rounded-xl border border-dashed p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              历史记录
            </p>
            <p className="text-sm text-muted-foreground">
              {draft.symbol && draft.marketType
                ? `${displayName || draft.symbol} · ${draft.marketType}`
                : '选择标的后按 ticker 加载'}
            </p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => void loadHistory()}>
            刷新
          </Button>
        </div>
        {historyLoading && <p className="mt-2 text-sm text-muted-foreground">加载中…</p>}
        {!historyLoading && history.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">暂无记录</p>
        )}
        <ul className="mt-3 space-y-2">
          {history.map((row) => (
            <li key={row.id} className="rounded-lg border bg-card">
              <button
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                onClick={() =>
                  setExpandedHistoryId((id) => (id === row.id ? null : row.id))
                }
              >
                <span>{formatDateTime(row.created_at)}</span>
                <span>
                  {row.direction === 'BUY' ? '买入' : '卖出'} ·{' '}
                  {row.passed ? '通过' : '未通过'}
                  {row.saved_without_order ? ' · 仅保存' : ''}
                </span>
              </button>
              {expandedHistoryId === row.id && (
                <pre className="max-h-64 overflow-auto border-t bg-muted/30 p-3 text-xs">
                  {JSON.stringify(
                    { answers: row.answers, calculator: row.calculator },
                    null,
                    2
                  )}
                </pre>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
