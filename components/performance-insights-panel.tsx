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
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
}

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
  const [aiModel, setAiModel] = useState('deepseek-v4-flash');
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

  const persistSavedReviews = (next: SavedAiReview[]) => {
    setSavedReviews(next);
    try {
      localStorage.setItem(savedReviewsKey, JSON.stringify(next));
    } catch {
      // Ignore storage errors.
    }
  };

  const precomputeLlmSummary = async (timeRange: AiTimeRange) => {
    try {
      const response = await fetch(`/api/analytics/llm-summary?timeRange=${timeRange}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) return;
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      setLlmSummary(payload);
      const generatedAt = typeof payload.generatedAt === 'string' ? payload.generatedAt : '';
      setLlmSummaryAt(generatedAt);
    } catch {
      // Keep AI button functional even if precompute fails.
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
        throw new Error(payload.error || 'Failed to fetch analytics');
      }
      const payload = (await response.json()) as AnalyticsResponse;
      setData(payload);
      void precomputeLlmSummary(aiTimeRange);
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
    void precomputeLlmSummary(aiTimeRange);
  }, [aiTimeRange]);

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

  const defaultModelByProvider: Record<'deepseek' | 'gemini' | 'kimi', string> = {
    deepseek: 'deepseek-v4-flash',
    gemini: 'gemini-3.5-flash',
    kimi: 'kimi-k2.6',
  };

  const handleProviderChange = (value: 'deepseek' | 'gemini' | 'kimi') => {
    setAiProvider(value);
    setAiModel(defaultModelByProvider[value]);
  };

  const generateAiReview = async () => {
    try {
      setAiLoading(true);
      setAiError(null);
      const response = await fetch('/api/analytics/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          model: aiModel.trim() || defaultModelByProvider[aiProvider],
          promptTemplate: aiPrompt,
          timeRange: aiTimeRange,
          summary: llmSummary || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.details || payload?.error || 'Failed to generate AI review');
      }
      setAiOutput(payload.analysis || '');
      setAiOutputGeneratedAt(payload.generatedAt || new Date().toISOString());
      setAiOutputDirty(true);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unknown error');
      setAiOutput('');
      setAiOutputGeneratedAt('');
      setAiOutputDirty(false);
    } finally {
      setAiLoading(false);
    }
  };

  const keepCurrentReview = async () => {
    if (!aiOutput.trim()) return;
    let generatedTitle = '复盘记录';
    try {
      const titleResp = await fetch('/api/analytics/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'title',
          provider: aiProvider,
          model: aiModel.trim() || defaultModelByProvider[aiProvider],
          reviewOutput: aiOutput,
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
      savedAt: aiOutputGeneratedAt || new Date().toISOString(),
      title: generatedTitle,
      provider: aiProvider,
      model: aiModel.trim() || defaultModelByProvider[aiProvider],
      timeRange: aiTimeRange,
      prompt: aiPrompt,
      output: aiOutput,
    };
    const next = [review, ...savedReviews].slice(0, 50);
    persistSavedReviews(next);
    setExpandedSavedReviews((prev) => ({ ...prev, [review.id]: false }));
    setAiOutput('');
    setAiOutputGeneratedAt('');
    setAiOutputDirty(false);
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
        </CardHeader>
        <CardContent>
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
                      group.assets.map((asset) => (
                        <TableRow key={`${group.tag}-${asset.symbol}-${asset.marketType}`} className="bg-muted/30">
                          <TableCell>
                            <div className="pl-6 font-medium">{asset.symbol}</div>
                            <div className="pl-6 text-base text-muted-foreground">{asset.name} · {asset.marketType}</div>
                          </TableCell>
                          <TableCell className="text-right">{asset.allocationPct.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">{formatCurrency(asset.currentValue, baseCurrency)}</TableCell>
                          <TableCell className={`text-right ${asset.realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(asset.realizedPnL, baseCurrency)}
                          </TableCell>
                          <TableCell className={`text-right ${asset.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(asset.unrealizedPnL, baseCurrency)}
                          </TableCell>
                          <TableCell className={`text-right ${asset.returnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {asset.returnPct.toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-right">{asset.avgHoldingDays.toFixed(1)} d</TableCell>
                        </TableRow>
                      ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Strategy Review</CardTitle>
        </CardHeader>
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
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left"
                      onClick={() => toggleSavedReview(review.id)}
                    >
                      <div>
                        <p className="text-sm font-medium">{review.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(review.savedAt)} · {review.provider} · {review.model}
                        </p>
                      </div>
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    {isOpen && (
                      <div className="border-t px-3 py-3">
                        <p className="mb-2 text-xs text-muted-foreground">
                          Range: {review.timeRange}
                        </p>
                        <div className="mb-3 rounded-md bg-muted/30 p-2">
                          <pre className="whitespace-pre-wrap text-sm leading-6">{review.output}</pre>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => loadSavedReviewToEditor(review.id)}>
                          Load Into Editor
                        </Button>
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
      </Card>
    </div>
  );
}
