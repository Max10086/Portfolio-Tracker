'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronRight, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { updateHoldingTag } from '@/app/actions/assets';
import {
  EditTransactionDialog,
  type EditableTransaction,
} from '@/components/edit-transaction-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PnlAttributionView } from '@/components/position-optimization/pnl-attribution-view';
import { MonthlyTimelineView } from '@/components/position-optimization/monthly-timeline-view';
import { PositionTreemapView } from '@/components/position-optimization/position-treemap-view';
import { StrategyQualityView } from '@/components/position-optimization/strategy-quality-view';
import { StopLossView } from '@/components/position-optimization/stop-loss-view';
import { GatekeeperView } from '@/components/position-optimization/gatekeeper-view';
import type { ClosedTradeRow } from '@/components/position-optimization/types';
import {
  loadAssetNameCache,
  listMissingAssetNameKeys,
  mergeAssetNameCache,
  normalizeAssetNameKey,
} from '@/lib/asset-name-cache';

interface ReviewPanel {
  currentValue: number;
  nonCashValue: number;
  netInvested: number;
  totalPnL: number;
  totalReturnPct: number;
  realizedPnL: number;
  unrealizedPnL: number;
  closedTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdownPct: number;
  drawdownFrom: string;
  drawdownTo: string;
  bestTrade: { symbol: string; pnl: number; returnPct: number; closedAt: string } | null;
  worstTrade: { symbol: string; pnl: number; returnPct: number; closedAt: string } | null;
}

interface BreakdownRow {
  key: string;
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;
  currentValue: number;
  trades: number;
  winRate: number;
}

interface AssetRow {
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

interface AnalyticsResponse {
  timeRange?: '7d' | '30d' | '90d' | '365d' | 'all';
  rangeStart?: string;
  baseCurrency: string;
  generatedAt: string;
  reviewPanel: ReviewPanel;
  breakdowns: {
    byAsset: AssetRow[];
    byMarket: BreakdownRow[];
    byTag: BreakdownRow[];
    monthlyPerformance: Array<{
      month: string;
      realizedPnL: number;
      trades: number;
      wins: number;
      losses: number;
      winRate: number;
    }>;
  };
  positionOptimization: string[];
  strategyActions: string[];
  behaviorCorrections: string[];
  behaviorStats: {
    avgHoldingDaysWinner: number;
    avgHoldingDaysLoser: number;
    maxLossStreak: number;
    trades30d: number;
  };
  closedTradesInRange?: ClosedTradeRow[];
}

type PositionOptTab =
  | 'table'
  | 'attribution'
  | 'timeline'
  | 'treemap'
  | 'strategy'
  | 'stops'
  | 'gatekeeper';

type AiTimeRange = '7d' | '30d' | '90d' | '365d';

interface SavedAiReview {
  id: string;
  savedAt: string;
  title: string;
  provider: 'deepseek' | 'gemini' | 'kimi';
  model: string;
  timeRange: AiTimeRange;
  prompt: string;
  output: string;
}

function formatCurrency(value: number, currency: string): string {
  const sign = value >= 0 ? '' : '-';
  const abs = Math.abs(value);
  return `${sign}${currency} ${abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US');
}

function assetHistoryKey(symbol: string, marketType: string): string {
  return normalizeAssetNameKey(symbol, marketType);
}

export function PerformanceInsightsPanel() {
  const savedReviewsKey = 'portfolio-tracker-ai-reviews-v1';
  const defaultAiPrompt = `你是极其严苛且洞察力极强的资深交易教练与行为金融分析师。
我将提供我近期的完整交易历史（包含盈亏记录）。请不要给我任何关于具体点位、指标或微观操作的战术建议，我需要的是极其冷酷、一针见血的深度行为复盘，以打破我的认知盲区并引发深度反思。

分析核心与视角：

非受迫性失误（可避免的亏损）： 穿透数据，指出哪些亏损纯粹是由于操作变形、情绪化或违背常识造成的低级错误。

利润敞口（可放大的盈利）： 找出那些方向正确但因为过早下车、仓位管理怯懦等行为，导致未能实现利润最大化的交易，并剖析背后的心理或逻辑成因。

致命行为模式： 从近期盈亏分布中，提炼出我当前最危险的 1-2 个下意识交易习惯。

输出原则：

拒绝啰嗦与安抚： 语言要求极度精炼、客观、甚至刺耳。不需要泛泛而谈的废话。

用数据打脸： 每一个反思结论，必须直接引用我提供的数据记录作为核心证据。

指明战略方向： 不需要给我设定具体的“触发条件”或“检查清单”，只需给我极简的、宏观层面的纠偏方向。

请严格按照以下格式输出：

1. 交易者行为画像与盈亏归因
（用 1-2 句话，基于数据一针见血地概括本周期内的核心交易状态与盈亏本质）

2. 必须斩断的非受迫性失误
错误模式 A： （描述错误） | 数据证据： （如：X月X日某笔交易） | 反思刺透： （为什么会犯这个错）

错误模式 B： （描述错误） | 数据证据： （如：X笔连续亏损） | 反思刺透： （潜意识在害怕或贪婪什么）

3. 被自我扼杀的利润扩张点
错失的杠杆： （指出哪类交易本可以赚更多）

行为变形点： （分析是因为盯盘太紧、拿不住单，还是仓位错配等原因）

4. 下阶段战略纠偏方向
（只给 1-3 条最核心的思维或系统调整方向，极简，不需要具体战术步骤）`;

  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTags, setExpandedTags] = useState<Record<string, boolean>>({});
  const [aiProvider, setAiProvider] = useState<'deepseek' | 'gemini' | 'kimi'>('deepseek');
  const [aiModel, setAiModel] = useState('deepseek-flash');
  const [aiTimeRange, setAiTimeRange] = useState<AiTimeRange>('30d');
  const [aiPrompt, setAiPrompt] = useState(defaultAiPrompt);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<string>('');
  const [aiOutputGeneratedAt, setAiOutputGeneratedAt] = useState<string>('');
  const [aiOutputDirty, setAiOutputDirty] = useState(false);
  const [llmSummary, setLlmSummary] = useState<Record<string, unknown> | null>(null);
  const [llmSummaryAt, setLlmSummaryAt] = useState<string>('');
  const [savedReviews, setSavedReviews] = useState<SavedAiReview[]>([]);
  const [expandedSavedReviews, setExpandedSavedReviews] = useState<Record<string, boolean>>({});
  const [aiSuccess, setAiSuccess] = useState<string | null>(null);
  const [aiSectionOpen, setAiSectionOpen] = useState(false);
  const [allTransactions, setAllTransactions] = useState<EditableTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txHistoryReady, setTxHistoryReady] = useState(false);
  const [assetNameByKey, setAssetNameByKey] = useState<Record<string, string>>(() =>
    typeof window !== 'undefined' ? loadAssetNameCache() : {}
  );
  const [namesLoading, setNamesLoading] = useState(false);
  const [expandedAssetHistory, setExpandedAssetHistory] = useState<Record<string, boolean>>({});
  const [editingTransaction, setEditingTransaction] = useState<EditableTransaction | null>(null);
  const [tagEditAsset, setTagEditAsset] = useState<AssetRow | null>(null);
  const [tagEditValue, setTagEditValue] = useState('');
  const [tagSaving, setTagSaving] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [positionOptTab, setPositionOptTab] = useState<PositionOptTab>('table');

  const isUsableLlmSummary = (summary: Record<string, unknown> | null) =>
    Boolean(summary?.historical_context && summary?.focus_context);

  const persistSavedReviews = (next: SavedAiReview[]) => {
    setSavedReviews(next);
    try {
      localStorage.setItem(savedReviewsKey, JSON.stringify(next));
    } catch {
      // Ignore storage errors.
    }
  };

  const precomputeLlmSummary = async (timeRange: AiTimeRange): Promise<Record<string, unknown> | null> => {
    try {
      const response = await fetch(`/api/analytics/llm-summary?timeRange=${timeRange}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) return null;
      setLlmSummary(payload);
      const generatedAt = typeof payload.generatedAt === 'string' ? payload.generatedAt : '';
      setLlmSummaryAt(generatedAt);
      return payload;
    } catch {
      return null;
    }
  };

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/analytics', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail =
          typeof payload.details === 'string' && payload.details.trim()
            ? payload.details.trim()
            : '';
        throw new Error(detail || payload.error || 'Failed to fetch analytics');
      }
      const payload = (await response.json()) as AnalyticsResponse;
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(savedReviewsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedAiReview[];
      if (Array.isArray(parsed)) {
        const normalized = parsed.map((item) => ({
          ...item,
          title: item.title || '复盘记录',
        }));
        setSavedReviews(normalized);
      }
    } catch {
      // Ignore parse/storage errors.
    }
  }, []);

  useEffect(() => {
    if (!aiSectionOpen) return;
    void precomputeLlmSummary(aiTimeRange);
  }, [aiSectionOpen, aiTimeRange]);

  const assetKeysSignature = useMemo(() => {
    if (!data?.breakdowns.byAsset?.length) return '';
    return data.breakdowns.byAsset
      .map((a) => assetHistoryKey(a.symbol, a.marketType))
      .sort()
      .join('|');
  }, [data?.breakdowns.byAsset]);

  useEffect(() => {
    if (loading || !data) return;
    setTxHistoryReady(false);
    void (async () => {
      await loadTransactions();
      setTxHistoryReady(true);
    })();
  }, [loading, data?.generatedAt]);

  useEffect(() => {
    if (!data?.breakdowns.byAsset?.length) return;

    const pairs = data.breakdowns.byAsset.map((asset) => ({
      symbol: asset.symbol,
      market_type: asset.marketType,
    }));
    const cached = loadAssetNameCache();
    const missing = listMissingAssetNameKeys(pairs, cached);
    if (missing.length === 0) return;

    let cancelled = false;
    setNamesLoading(true);
    void (async () => {
      try {
        const response = await fetch('/api/asset-names', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assets: missing.map(({ symbol, market_type }) => ({ symbol, market_type })),
          }),
        });
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as { names?: Record<string, string> };
        if (!payload.names || cancelled) return;
        const merged = mergeAssetNameCache(payload.names);
        setAssetNameByKey((prev) => ({ ...prev, ...merged }));
      } catch {
        // Keep symbol fallback in UI.
      } finally {
        if (!cancelled) setNamesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assetKeysSignature, data?.breakdowns.byAsset]);

  const allAssets = useMemo(() => data?.breakdowns.byAsset || [], [data]);
  const groupedByTag = useMemo(() => {
    const map = new Map<
      string,
      {
        tag: string;
        assets: AssetRow[];
        allocationPct: number;
        currentValue: number;
        realizedPnL: number;
        unrealizedPnL: number;
        investedCapital: number;
        returnPct: number;
        avgHoldingDays: number;
      }
    >();

    for (const asset of allAssets) {
      const key = asset.tag || 'Uncategorized';
      const row = map.get(key) || {
        tag: key,
        assets: [],
        allocationPct: 0,
        currentValue: 0,
        realizedPnL: 0,
        unrealizedPnL: 0,
        investedCapital: 0,
        returnPct: 0,
        avgHoldingDays: 0,
      };
      row.assets.push(asset);
      row.allocationPct += asset.allocationPct;
      row.currentValue += asset.currentValue;
      row.realizedPnL += asset.realizedPnL;
      row.unrealizedPnL += asset.unrealizedPnL;
      row.investedCapital += asset.investedCapital;
      map.set(key, row);
    }

    const grouped = Array.from(map.values())
      .map((group) => {
        const returnPct = group.investedCapital > 0 ? ((group.realizedPnL + group.unrealizedPnL) / group.investedCapital) * 100 : 0;
        const weightBase = group.assets.reduce((sum, asset) => sum + Math.max(asset.investedCapital, 1), 0);
        const avgHoldingDays = weightBase > 0
          ? group.assets.reduce((sum, asset) => sum + asset.avgHoldingDays * Math.max(asset.investedCapital, 1), 0) / weightBase
          : 0;
        return {
          ...group,
          returnPct,
          avgHoldingDays,
          assets: group.assets.sort((a, b) => b.currentValue - a.currentValue),
        };
      })
      .sort((a, b) => b.currentValue - a.currentValue);

    return grouped;
  }, [allAssets]);

  const toggleTag = (tag: string) => {
    setExpandedTags((prev) => ({ ...prev, [tag]: !prev[tag] }));
  };

  const loadTransactions = async () => {
    setTxLoading(true);
    try {
      const response = await fetch('/api/transactions?view=transactions', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) {
        throw new Error('Failed to load transactions');
      }
      const payload = (await response.json()) as { transactions?: EditableTransaction[] };
      setAllTransactions(payload.transactions || []);
    } catch {
      setAllTransactions([]);
    } finally {
      setTxLoading(false);
    }
  };

  const refreshAfterTxChange = async () => {
    await fetchAnalytics();
  };

  const displayNameForAsset = (symbol: string, marketType: string, fallback?: string) => {
    const key = assetHistoryKey(symbol, marketType);
    return assetNameByKey[key] || fallback || symbol;
  };

  const drillToTagInTable = (tag: string) => {
    setPositionOptTab('table');
    setExpandedTags((prev) => ({ ...prev, [tag]: true }));
  };

  const drillToAssetInTable = (symbol: string, marketType: string) => {
    const asset = allAssets.find(
      (a) => a.symbol.toUpperCase() === symbol.toUpperCase() && a.marketType === marketType
    );
    const tag = asset?.tag || 'Uncategorized';
    setPositionOptTab('table');
    setExpandedTags((prev) => ({ ...prev, [tag]: true }));
    setExpandedAssetHistory((prev) => ({
      ...prev,
      [assetHistoryKey(symbol, marketType)]: true,
    }));
  };

  const toggleAssetHistory = (symbol: string, marketType: string) => {
    const key = assetHistoryKey(symbol, marketType);
    setExpandedAssetHistory((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const transactionsForAsset = (symbol: string, marketType: string) =>
    allTransactions
      .filter(
        (tx) =>
          tx.symbol.toUpperCase() === symbol.toUpperCase() &&
          tx.market_type === marketType
      )
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));

  const openTagEditor = (asset: AssetRow) => {
    setTagEditAsset(asset);
    setTagEditValue(asset.tag === 'Uncategorized' ? '' : asset.tag);
    setTagError(null);
  };

  const saveAssetTag = async () => {
    if (!tagEditAsset) return;
    setTagSaving(true);
    setTagError(null);
    const result = await updateHoldingTag(tagEditAsset.symbol, tagEditAsset.marketType, tagEditValue);
    setTagSaving(false);
    if (result.success) {
      setTagEditAsset(null);
      await refreshAfterTxChange();
    } else {
      setTagError(result.error || 'Failed to update tag');
    }
  };

  const defaultModelByProvider: Record<'deepseek' | 'gemini' | 'kimi', string> = {
    deepseek: 'deepseek-flash',
    gemini: 'gemini-3.5-flash',
    kimi: 'kimi-k2.6',
  };

  const handleProviderChange = (value: 'deepseek' | 'gemini' | 'kimi') => {
    setAiProvider(value);
    setAiModel(defaultModelByProvider[value]);
  };

  const saveReviewToLibrary = async (output: string, generatedAt: string) => {
    let generatedTitle = '复盘记录';
    try {
      const titleResp = await fetch('/api/analytics/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'title',
          provider: aiProvider,
          model: aiModel.trim() || defaultModelByProvider[aiProvider],
          reviewOutput: output,
        }),
      });
      const titlePayload = await titleResp.json().catch(() => ({}));
      if (titleResp.ok && typeof titlePayload?.title === 'string' && titlePayload.title.trim()) {
        generatedTitle = titlePayload.title.trim().slice(0, 20);
      }
    } catch {
      // Fallback to default title if title generation fails.
    }
    const review: SavedAiReview = {
      id: `${Date.now()}`,
      savedAt: generatedAt,
      title: generatedTitle,
      provider: aiProvider,
      model: aiModel.trim() || defaultModelByProvider[aiProvider],
      timeRange: aiTimeRange,
      prompt: aiPrompt,
      output,
    };
    const next = [review, ...savedReviews].slice(0, 50);
    persistSavedReviews(next);
    setExpandedSavedReviews((prev) => ({ ...prev, [review.id]: true }));
    return review;
  };

  const generateAiReview = async () => {
    try {
      setAiLoading(true);
      setAiError(null);
      setAiSuccess(null);

      let summaryForRequest = isUsableLlmSummary(llmSummary) ? llmSummary : null;
      if (!summaryForRequest) {
        summaryForRequest = await precomputeLlmSummary(aiTimeRange);
      }
      if (!isUsableLlmSummary(summaryForRequest)) {
        throw new Error(
          'Analytics summary is not ready yet. Wait for the insights section to finish loading, then try again.'
        );
      }

      const response = await fetch('/api/analytics/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          model: aiModel.trim() || defaultModelByProvider[aiProvider],
          promptTemplate: aiPrompt,
          timeRange: aiTimeRange,
          summary: summaryForRequest,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.details || payload?.error || 'Failed to generate AI review');
      }
      const analysis = typeof payload.analysis === 'string' ? payload.analysis.trim() : '';
      if (!analysis) {
        throw new Error('AI returned empty content. Try another provider or model.');
      }
      const generatedAt =
        typeof payload.generatedAt === 'string' ? payload.generatedAt : new Date().toISOString();
      setAiOutput(analysis);
      setAiOutputGeneratedAt(generatedAt);
      setAiOutputDirty(true);

      const saved = await saveReviewToLibrary(analysis, generatedAt);
      setAiSuccess(`Review saved as "${saved.title}". Expand it under Saved Reviews below.`);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unknown error');
      setAiOutput('');
      setAiOutputGeneratedAt('');
      setAiOutputDirty(false);
      setAiSuccess(null);
    } finally {
      setAiLoading(false);
    }
  };

  const keepCurrentReview = async () => {
    if (!aiOutput.trim()) return;
    await saveReviewToLibrary(aiOutput, aiOutputGeneratedAt || new Date().toISOString());
    setAiOutput('');
    setAiOutputGeneratedAt('');
    setAiOutputDirty(false);
    setAiSuccess('Review saved to Saved Reviews.');
  };

  const dropCurrentReview = () => {
    setAiOutput('');
    setAiOutputGeneratedAt('');
    setAiOutputDirty(false);
  };

  const toggleSavedReview = (id: string) => {
    setExpandedSavedReviews((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const loadSavedReviewToEditor = (id: string) => {
    const item = savedReviews.find((review) => review.id === id);
    if (!item) return;
    setAiProvider(item.provider);
    setAiModel(item.model);
    setAiTimeRange(item.timeRange);
    setAiPrompt(item.prompt);
    setAiOutput(item.output);
    setAiOutputGeneratedAt(item.savedAt);
    setAiOutputDirty(false);
  };

  const deleteSavedReview = (id: string) => {
    const next = savedReviews.filter((review) => review.id !== id);
    persistSavedReviews(next);
    setExpandedSavedReviews((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading analytics...</div>;
  }

  if (error || !data) {
    return (
      <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
        {error || 'Failed to load analytics'}
      </div>
    );
  }

  const { reviewPanel, baseCurrency } = data;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={fetchAnalytics} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh Insights
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trading Review Panel</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 text-base">
          <div>
            <p className="text-muted-foreground">Current Value</p>
            <p className="font-semibold">{formatCurrency(reviewPanel.currentValue, baseCurrency)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Net Invested</p>
            <p className="font-semibold">{formatCurrency(reviewPanel.netInvested, baseCurrency)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total PnL</p>
            <p className={`font-semibold ${reviewPanel.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(reviewPanel.totalPnL, baseCurrency)} ({reviewPanel.totalReturnPct.toFixed(2)}%)
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Realized / Unrealized</p>
            <p className="font-semibold">
              {formatCurrency(reviewPanel.realizedPnL, baseCurrency)} /{' '}
              {formatCurrency(reviewPanel.unrealizedPnL, baseCurrency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Closed Trades / Win Rate</p>
            <p className="font-semibold">
              {reviewPanel.closedTrades} / {reviewPanel.winRate.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Avg Win / Avg Loss</p>
            <p className="font-semibold">
              {formatCurrency(reviewPanel.avgWin, baseCurrency)} / {formatCurrency(-reviewPanel.avgLoss, baseCurrency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Profit Factor</p>
            <p className="font-semibold">{reviewPanel.profitFactor.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Max Drawdown</p>
            <p className="font-semibold text-red-600">{reviewPanel.maxDrawdownPct.toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(reviewPanel.drawdownFrom)} → {formatDate(reviewPanel.drawdownTo)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Position Optimization</CardTitle>
          <p className="mt-1 text-sm font-normal text-muted-foreground">
            Expand each asset to audit buys/sells and fix bad history.
            {txLoading && !txHistoryReady ? ' · Loading transaction history…' : ''}
            {namesLoading ? ' · Resolving asset names…' : ''}
          </p>
        </CardHeader>
        <CardContent>
          <Tabs
            value={positionOptTab}
            onValueChange={(value) => setPositionOptTab(value as PositionOptTab)}
            className="w-full"
          >
            <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 p-1">
              <TabsTrigger value="table" className="text-xs sm:text-sm">
                Table
              </TabsTrigger>
              <TabsTrigger value="attribution" className="text-xs sm:text-sm">
                Attribution
              </TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs sm:text-sm">
                Timeline
              </TabsTrigger>
              <TabsTrigger value="treemap" className="text-xs sm:text-sm">
                Map
              </TabsTrigger>
              <TabsTrigger value="strategy" className="text-xs sm:text-sm">
                Strategy
              </TabsTrigger>
              <TabsTrigger value="stops" className="text-xs sm:text-sm">
                Stops
              </TabsTrigger>
              <TabsTrigger value="gatekeeper" className="text-xs sm:text-sm">
                Gatekeeper
              </TabsTrigger>
            </TabsList>

            <TabsContent value="attribution" className="mt-0">
              <PnlAttributionView
                byTag={data.breakdowns.byTag}
                byMarket={data.breakdowns.byMarket}
                byAsset={allAssets}
                baseCurrency={baseCurrency}
                onDrillTag={drillToTagInTable}
                onDrillAsset={drillToAssetInTable}
              />
            </TabsContent>

            <TabsContent value="timeline" className="mt-0">
              <MonthlyTimelineView
                monthlyPerformance={data.breakdowns.monthlyPerformance}
                closedTrades={data.closedTradesInRange ?? []}
                baseCurrency={baseCurrency}
              />
            </TabsContent>

            <TabsContent value="treemap" className="mt-0">
              <PositionTreemapView
                assets={allAssets}
                baseCurrency={baseCurrency}
                onSelectAsset={drillToAssetInTable}
              />
            </TabsContent>

            <TabsContent value="strategy" className="mt-0">
              <StrategyQualityView
                byTag={data.breakdowns.byTag}
                byAsset={allAssets}
                behaviorStats={data.behaviorStats}
                baseCurrency={baseCurrency}
                onDrillTag={drillToTagInTable}
              />
            </TabsContent>

            <TabsContent value="stops" className="mt-0">
              <StopLossView assets={allAssets} assetNameByKey={assetNameByKey} />
            </TabsContent>

            <TabsContent value="gatekeeper" className="mt-0">
              <GatekeeperView
                assets={allAssets}
                assetNameByKey={assetNameByKey}
                defaultEquity={data?.reviewPanel.currentValue ?? 0}
                baseCurrency={data?.baseCurrency ?? 'USD'}
              />
            </TabsContent>

            <TabsContent value="table" className="mt-0">
          <Table className="text-base">
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead className="text-right">Allocation</TableHead>
                <TableHead className="text-right">Current Value</TableHead>
                <TableHead className="text-right">Realized</TableHead>
                <TableHead className="text-right">Unrealized</TableHead>
                <TableHead className="text-right">Return</TableHead>
                <TableHead className="text-right">Avg Hold</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedByTag.map((group) => {
                const isOpen = !!expandedTags[group.tag];
                return (
                  <Fragment key={group.tag}>
                    <TableRow key={group.tag}>
                      <TableCell>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 font-medium"
                          onClick={() => toggleTag(group.tag)}
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {group.tag}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">{group.allocationPct.toFixed(2)}%</TableCell>
                      <TableCell className="text-right">{formatCurrency(group.currentValue, baseCurrency)}</TableCell>
                      <TableCell className={`text-right ${group.realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(group.realizedPnL, baseCurrency)}
                      </TableCell>
                      <TableCell className={`text-right ${group.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(group.unrealizedPnL, baseCurrency)}
                      </TableCell>
                      <TableCell className={`text-right ${group.returnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {group.returnPct.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">{group.avgHoldingDays.toFixed(1)} d</TableCell>
                    </TableRow>
                    {isOpen &&
                      group.assets.map((asset) => {
                        const historyKey = assetHistoryKey(asset.symbol, asset.marketType);
                        const historyOpen = !!expandedAssetHistory[historyKey];
                        const assetTxs = transactionsForAsset(asset.symbol, asset.marketType);
                        const resolvedName = displayNameForAsset(asset.symbol, asset.marketType, asset.name);
                        const showResolvedName =
                          resolvedName.trim().toUpperCase() !== asset.symbol.trim().toUpperCase();
                        return (
                          <Fragment key={`${group.tag}-${asset.symbol}-${asset.marketType}`}>
                            <TableRow className="bg-muted/30">
                              <TableCell>
                                <div className="flex items-start gap-2 pl-4">
                                  {txHistoryReady ? (
                                    <button
                                      type="button"
                                      className="mt-0.5 inline-flex shrink-0"
                                      aria-label={
                                        historyOpen
                                          ? `Collapse ${asset.symbol} transactions`
                                          : `Expand ${asset.symbol} transactions`
                                      }
                                      onClick={() => toggleAssetHistory(asset.symbol, asset.marketType)}
                                    >
                                      {historyOpen ? (
                                        <ChevronDown className="h-4 w-4" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4" />
                                      )}
                                    </button>
                                  ) : (
                                    <span className="w-4 shrink-0" />
                                  )}
                                  <div>
                                    <div className="flex items-center gap-2 font-medium">
                                      <span>{asset.symbol}</span>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        aria-label={`Edit tag for ${asset.symbol}`}
                                        onClick={() => openTagEditor(asset)}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                    <div className="text-base text-muted-foreground">
                                      {showResolvedName
                                        ? `${resolvedName} · ${asset.marketType}`
                                        : namesLoading
                                          ? `… · ${asset.marketType}`
                                          : asset.marketType}
                                      {txHistoryReady ? ` · ${assetTxs.length} tx` : ''}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{asset.allocationPct.toFixed(2)}%</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(asset.currentValue, baseCurrency)}
                              </TableCell>
                              <TableCell
                                className={`text-right ${asset.realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}
                              >
                                {formatCurrency(asset.realizedPnL, baseCurrency)}
                              </TableCell>
                              <TableCell
                                className={`text-right ${asset.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}
                              >
                                {formatCurrency(asset.unrealizedPnL, baseCurrency)}
                              </TableCell>
                              <TableCell
                                className={`text-right ${asset.returnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}
                              >
                                {asset.returnPct.toFixed(2)}%
                              </TableCell>
                              <TableCell className="text-right">{asset.avgHoldingDays.toFixed(1)} d</TableCell>
                            </TableRow>
                            {txHistoryReady && historyOpen && (
                              <TableRow className="bg-muted/20">
                                <TableCell colSpan={7} className="p-0">
                                  <div className="border-t px-6 py-3">
                                    {assetTxs.length === 0 ? (
                                      <p className="text-sm text-muted-foreground">No transactions found.</p>
                                    ) : (
                                      <Table className="text-sm">
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead className="text-right">Qty</TableHead>
                                            <TableHead className="text-right">Price</TableHead>
                                            <TableHead>Tag</TableHead>
                                            <TableHead>Notes</TableHead>
                                            <TableHead className="w-[72px]" />
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {assetTxs.map((tx) => (
                                            <TableRow key={tx.id}>
                                              <TableCell>{formatDate(tx.transaction_date)}</TableCell>
                                              <TableCell>{tx.transaction_type}</TableCell>
                                              <TableCell className="text-right">
                                                {tx.quantity.toLocaleString('en-US', {
                                                  maximumFractionDigits: 8,
                                                })}
                                              </TableCell>
                                              <TableCell className="text-right">
                                                {tx.price_per_unit != null
                                                  ? tx.price_per_unit.toLocaleString('en-US', {
                                                      maximumFractionDigits: 8,
                                                    })
                                                  : '—'}
                                              </TableCell>
                                              <TableCell>{tx.tag?.trim() || 'Uncategorized'}</TableCell>
                                              <TableCell className="max-w-[200px] truncate">
                                                {tx.notes?.trim() || '—'}
                                              </TableCell>
                                              <TableCell>
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-8 w-8"
                                                  aria-label="Edit transaction"
                                                  onClick={() => setEditingTransaction(tx)}
                                                >
                                                  <Pencil className="h-4 w-4" />
                                                </Button>
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setAiSectionOpen((open) => !open)}
            aria-expanded={aiSectionOpen}
          >
            <div>
              <CardTitle className="text-lg">AI Strategy Review</CardTitle>
              <p className="mt-1 text-sm font-normal text-muted-foreground">
                {aiSectionOpen
                  ? 'Generate reviews and manage saved history'
                  : 'Collapsed — expand when you need an AI review'}
                {savedReviews.length > 0 ? ` · ${savedReviews.length} saved` : ''}
              </p>
            </div>
            {aiSectionOpen ? (
              <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
          </button>
        </CardHeader>
        {aiSectionOpen && (
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Provider</p>
              <Select value={aiProvider} onValueChange={(value) => handleProviderChange(value as 'deepseek' | 'gemini' | 'kimi')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="kimi">Kimi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Model</p>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="Model name"
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Analysis Range</p>
              <Select value={aiTimeRange} onValueChange={(value) => setAiTimeRange(value as AiTimeRange)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 1 Week</SelectItem>
                  <SelectItem value="30d">Last 1 Month</SelectItem>
                  <SelectItem value="90d">Last 3 Months</SelectItem>
                  <SelectItem value="365d">Last 1 Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Prompt (Editable)</p>
            <textarea
              className="min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={generateAiReview} disabled={aiLoading}>
              {aiLoading ? 'Generating...' : 'Generate AI Review'}
            </Button>
            {aiOutput && aiOutputDirty && (
              <>
                <Button variant="default" onClick={keepCurrentReview}>
                  Keep
                </Button>
                <Button variant="outline" onClick={dropCurrentReview}>
                  Drop
                </Button>
              </>
            )}
          </div>
          {savedReviews.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Saved Reviews</p>
              {savedReviews.map((review) => {
                const isOpen = !!expandedSavedReviews[review.id];
                return (
                  <div key={review.id} className="rounded-md border">
                    <div className="flex items-center gap-1 pr-2">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center justify-between px-3 py-2 text-left"
                        onClick={() => toggleSavedReview(review.id)}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-sm font-medium">{review.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(review.savedAt)} · {review.provider} · {review.model}
                          </p>
                        </div>
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        )}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete review ${review.title}`}
                        onClick={() => deleteSavedReview(review.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {isOpen && (
                      <div className="border-t px-3 py-3">
                        <p className="mb-2 text-xs text-muted-foreground">
                          Range: {review.timeRange}
                        </p>
                        <div className="mb-3 rounded-md bg-muted/30 p-2">
                          <pre className="whitespace-pre-wrap text-sm leading-6">{review.output}</pre>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => loadSavedReviewToEditor(review.id)}>
                            Load Into Editor
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteSavedReview(review.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            LLM Summary: {llmSummaryAt ? `precomputed at ${formatDate(llmSummaryAt)} (${aiTimeRange})` : 'not ready yet'}
          </p>
          {aiError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{aiError}</div>
          )}
          {aiSuccess && (
            <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
              {aiSuccess}
            </div>
          )}
          {aiOutput && (
            <div className="rounded-md border p-4">
              <p className="mb-2 text-sm font-medium text-muted-foreground">Model Output</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Generated: {aiOutputGeneratedAt ? formatDate(aiOutputGeneratedAt) : '-'} · Provider: {aiProvider}
                {' · '}
                Model: {aiModel} · Range: {aiTimeRange}
              </p>
              <pre className="whitespace-pre-wrap text-base leading-7">{aiOutput}</pre>
            </div>
          )}
        </CardContent>
        )}
      </Card>

      <EditTransactionDialog
        transaction={editingTransaction}
        open={!!editingTransaction}
        onOpenChange={(open) => {
          if (!open) setEditingTransaction(null);
        }}
        onSaved={() => void refreshAfterTxChange()}
      />

      <Dialog
        open={!!tagEditAsset}
        onOpenChange={(open) => {
          if (!open && !tagSaving) setTagEditAsset(null);
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Edit tag for {tagEditAsset?.symbol}</DialogTitle>
            <DialogDescription>
              Applies to every transaction with this symbol and market (same ticker).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="position-opt-tag">Tag / category</Label>
              <Input
                id="position-opt-tag"
                placeholder="e.g., Crypto core"
                value={tagEditValue}
                onChange={(e) => setTagEditValue(e.target.value)}
                disabled={tagSaving}
              />
            </div>
            {tagError && <p className="text-sm text-red-600">{tagError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagEditAsset(null)} disabled={tagSaving}>
              Cancel
            </Button>
            <Button onClick={() => void saveAssetTag()} disabled={tagSaving}>
              {tagSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
