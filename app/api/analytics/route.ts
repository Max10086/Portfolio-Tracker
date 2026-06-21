import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { calculatePortfolioTotal, CurrencyConverter, type Asset, type MarketType } from '@/lib/price-service';

export const dynamic = 'force-dynamic';

type TxType = 'BUY' | 'SELL';

interface RawTransaction {
  symbol: string;
  market_type: MarketType;
  transaction_type: TxType;
  quantity: number;
  price_per_unit: number | null;
  transaction_date: string;
  created_at: string;
  tag: string | null;
}

interface Lot {
  qty: number;
  costPerUnit: number;
  currency: string;
  date: Date;
}

interface ClosedTrade {
  symbol: string;
  marketType: MarketType;
  tag: string;
  quantity: number;
  pnl: number;
  cost: number;
  proceeds: number;
  returnPct: number;
  holdingDays: number;
  closedAt: string;
}

interface AssetStats {
  symbol: string;
  name: string;
  marketType: MarketType;
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

interface AggregateStats {
  key: string;
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;
  currentValue: number;
  trades: number;
  wins: number;
}

interface HoldingAccumulator {
  daysQty: number;
  qty: number;
}

type TimeRange = '7d' | '30d' | '90d' | '365d' | 'all';

const PAGE_SIZE = 1000;
const MAX_SNAPSHOT_ROWS = 20000;
const ANALYTICS_CACHE_TTL_MS = 10 * 60 * 1000;
const HOLDINGS_VALUATION_RETRY_ATTEMPTS = 6;
const HOLDINGS_VALUATION_RETRY_DELAY_MS = 1200;

interface AnalyticsCacheEntry {
  payload: unknown;
  generatedAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __analyticsCacheMap: Map<string, AnalyticsCacheEntry> | undefined;
}

function parseTimeRange(value: string | null): TimeRange {
  if (!value) return 'all';
  if (value === '7d' || value === '30d' || value === '90d' || value === '365d') return value;
  return 'all';
}

function timeRangeToDays(range: TimeRange): number | null {
  if (range === 'all') return null;
  if (range === '7d') return 7;
  if (range === '90d') return 90;
  if (range === '365d') return 365;
  return 30;
}

function marketCurrency(marketType: MarketType): 'USD' | 'CNY' | 'HKD' {
  if (marketType === 'CN') return 'CNY';
  if (marketType === 'HK') return 'HKD';
  return 'USD';
}

function keyFor(symbol: string, marketType: string): string {
  return `${symbol.toUpperCase()}:${marketType}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pushInsight(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function hasInvalidHeldCryptoValues(
  valuation: Awaited<ReturnType<typeof calculatePortfolioTotal>>
): boolean {
  return valuation.assetDetails.some(
    (detail) =>
      detail.asset.market_type === 'CRYPTO' &&
      detail.asset.quantity > 0 &&
      (!Number.isFinite(detail.price) || detail.price <= 0 || !Number.isFinite(detail.value) || detail.value <= 0)
  );
}

export async function GET(request: NextRequest) {
  try {
    const timeRange = parseTimeRange(request.nextUrl.searchParams.get('timeRange'));
    const rangeDays = timeRangeToDays(timeRange);
    const cutoffDate = rangeDays
      ? new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000)
      : new Date(0);
    const supabase = createServerClient();
    const baseCurrency = (process.env.BASE_CURRENCY || 'USD').toUpperCase();
    const converter = new CurrencyConverter();

    // Fast fingerprint query: if no new transaction arrives, reuse last analytics payload.
    const [latestTxRes, txCountRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1),
      supabase.from('transactions').select('id', { count: 'exact', head: true }),
    ]);

    if (latestTxRes.error) {
      return NextResponse.json(
        { error: 'Failed to fetch latest transaction marker', details: latestTxRes.error.message },
        { status: 500 }
      );
    }
    if (txCountRes.error) {
      return NextResponse.json(
        { error: 'Failed to fetch transaction count marker', details: txCountRes.error.message },
        { status: 500 }
      );
    }

    const latestCreatedAt = latestTxRes.data?.[0]?.created_at || 'none';
    const txCount = txCountRes.count || 0;
    const markerKey = `analytics-v2|${latestCreatedAt}|${txCount}|${baseCurrency}|${timeRange}`;
    if (!globalThis.__analyticsCacheMap) {
      globalThis.__analyticsCacheMap = new Map<string, AnalyticsCacheEntry>();
    }
    const cacheMap = globalThis.__analyticsCacheMap;
    const cacheEntry = cacheMap.get(markerKey);
    if (
      cacheEntry &&
      Date.now() - cacheEntry.generatedAt <= ANALYTICS_CACHE_TTL_MS
    ) {
      return NextResponse.json(cacheEntry.payload);
    }

    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .select('symbol, market_type, transaction_type, quantity, price_per_unit, transaction_date, created_at, tag')
      .order('transaction_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (txError) {
      return NextResponse.json({ error: 'Failed to fetch transactions', details: txError.message }, { status: 500 });
    }

    const transactions = (txData || []) as RawTransaction[];
    const nonCashTransactions = transactions.filter((tx) => tx.market_type !== 'CASH');
    const isInRange = (tx: RawTransaction) =>
      new Date(tx.transaction_date).getTime() >= cutoffDate.getTime();

    const uniqueAssetsMap = new Map<string, Asset>();
    for (const tx of nonCashTransactions) {
      const key = keyFor(tx.symbol, tx.market_type);
      if (!uniqueAssetsMap.has(key)) {
        uniqueAssetsMap.set(key, {
          id: key,
          symbol: tx.symbol.toUpperCase(),
          market_type: tx.market_type,
          quantity: 1,
        });
      }
    }
    const uniqueAssets = Array.from(uniqueAssetsMap.values());

    const fallbackPriceMap = new Map<string, number>();
    const assetNameByKey = new Map<string, string>();
    const investedByAsset = new Map<string, number>();
    const holdingAccByAsset = new Map<string, HoldingAccumulator>();
    if (uniqueAssets.length > 0) {
      const fallbackPricing = await calculatePortfolioTotal({ assets: uniqueAssets, baseCurrency });
      for (const detail of fallbackPricing.assetDetails) {
        const assetKey = keyFor(detail.asset.symbol, detail.asset.market_type);
        if (detail.price > 0) fallbackPriceMap.set(assetKey, detail.price);
        if (detail.name && detail.name.trim()) assetNameByKey.set(assetKey, detail.name.trim());
      }
    }

    const { data: holdingsData, error: holdingsError } = await supabase
      .from('current_holdings')
      .select('symbol, market_type, quantity')
      .gt('quantity', 0);

    if (holdingsError) {
      return NextResponse.json({ error: 'Failed to fetch holdings', details: holdingsError.message }, { status: 500 });
    }

    const holdingsAssets: Asset[] = (holdingsData || []).map((h, idx) => ({
      id: `${h.symbol}-${idx}`,
      symbol: String(h.symbol).toUpperCase(),
      market_type: h.market_type as MarketType,
      quantity: Number(h.quantity),
    }));

    let holdingsValuation: Awaited<ReturnType<typeof calculatePortfolioTotal>> | null = null;
    for (let attempt = 1; attempt <= HOLDINGS_VALUATION_RETRY_ATTEMPTS; attempt++) {
      const candidate = await calculatePortfolioTotal({
        assets: holdingsAssets,
        baseCurrency,
      });
      holdingsValuation = candidate;
      if (!hasInvalidHeldCryptoValues(candidate)) break;
      if (attempt < HOLDINGS_VALUATION_RETRY_ATTEMPTS) {
        console.warn(
          `[analytics] Invalid held crypto valuation detected, retry ${attempt}/${HOLDINGS_VALUATION_RETRY_ATTEMPTS}`
        );
        await sleep(HOLDINGS_VALUATION_RETRY_DELAY_MS);
      }
    }
    if (!holdingsValuation) {
      throw new Error('Failed to build holdings valuation.');
    }
    if (hasInvalidHeldCryptoValues(holdingsValuation)) {
      throw new Error('Crypto holdings valuation remained invalid after retries.');
    }

    const currentValueMap = new Map<string, number>();
    const currentQtyMap = new Map<string, number>();
    for (const detail of holdingsValuation.assetDetails) {
      const assetKey = keyFor(detail.asset.symbol, detail.asset.market_type);
      currentValueMap.set(assetKey, detail.value);
      currentQtyMap.set(assetKey, detail.asset.quantity);
      if (detail.price > 0 && !fallbackPriceMap.has(assetKey)) {
        fallbackPriceMap.set(assetKey, detail.price);
      }
      if (detail.name && detail.name.trim()) {
        assetNameByKey.set(assetKey, detail.name.trim());
      }
    }

    const tagByAsset = new Map<string, string>();
    for (const tx of transactions) {
      const assetKey = keyFor(tx.symbol, tx.market_type);
      if (tx.tag && tx.tag.trim()) tagByAsset.set(assetKey, tx.tag.trim());
    }

    const lotsByAsset = new Map<string, Lot[]>();
    const closedTrades: ClosedTrade[] = [];
    let grossProfit = 0;
    let grossLoss = 0;
    let netInvested = 0;

    const byAssetAgg = new Map<string, AggregateStats>();
    const byMarketAgg = new Map<string, AggregateStats>();
    const byTagAgg = new Map<string, AggregateStats>();

    const ensureAgg = (map: Map<string, AggregateStats>, key: string): AggregateStats => {
      const existing = map.get(key);
      if (existing) return existing;
      const created: AggregateStats = {
        key,
        realizedPnL: 0,
        unrealizedPnL: 0,
        totalPnL: 0,
        currentValue: 0,
        trades: 0,
        wins: 0,
      };
      map.set(key, created);
      return created;
    };

    for (const tx of nonCashTransactions) {
      const assetKey = keyFor(tx.symbol, tx.market_type);
      const txDate = new Date(tx.transaction_date);
      const qty = Number(tx.quantity);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const currency = marketCurrency(tx.market_type);
      const unitPrice = tx.price_per_unit ?? fallbackPriceMap.get(assetKey) ?? 0;
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;

      const txValueBase = await converter.convert(unitPrice * qty, currency, baseCurrency);
      if (!isInRange(tx)) {
        const lots = lotsByAsset.get(assetKey) || [];
        if (tx.transaction_type === 'BUY') {
          lots.push({
            qty,
            costPerUnit: unitPrice,
            currency,
            date: txDate,
          });
        } else {
          let remaining = qty;
          while (remaining > 0 && lots.length > 0) {
            const lot = lots[0];
            const useQty = Math.min(remaining, lot.qty);
            lot.qty -= useQty;
            remaining -= useQty;
            if (lot.qty <= 1e-8) lots.shift();
          }
        }
        lotsByAsset.set(assetKey, lots);
        continue;
      }

      if (tx.transaction_type === 'BUY') {
        netInvested += txValueBase;
        investedByAsset.set(assetKey, (investedByAsset.get(assetKey) || 0) + txValueBase);
        const lots = lotsByAsset.get(assetKey) || [];
        lots.push({
          qty,
          costPerUnit: unitPrice,
          currency,
          date: txDate,
        });
        lotsByAsset.set(assetKey, lots);
        continue;
      }

      netInvested -= txValueBase;

      const lots = lotsByAsset.get(assetKey) || [];
      let remaining = qty;
      let matchedQty = 0;
      let matchedCostBase = 0;
      let weightedHoldingDays = 0;

      while (remaining > 0 && lots.length > 0) {
        const lot = lots[0];
        const useQty = Math.min(remaining, lot.qty);
        const lotCostBase = await converter.convert(lot.costPerUnit * useQty, lot.currency, baseCurrency);
        matchedCostBase += lotCostBase;
        matchedQty += useQty;
        const holdingDays = Math.max(
          0,
          (txDate.getTime() - lot.date.getTime()) / (1000 * 60 * 60 * 24)
        );
        weightedHoldingDays += holdingDays * useQty;

        lot.qty -= useQty;
        remaining -= useQty;
        if (lot.qty <= 1e-8) lots.shift();
      }

      lotsByAsset.set(assetKey, lots);
      if (matchedQty <= 0) continue;

      const proceedsBase = await converter.convert(unitPrice * matchedQty, currency, baseCurrency);
      const pnl = proceedsBase - matchedCostBase;
      const returnPct = matchedCostBase > 0 ? (pnl / matchedCostBase) * 100 : 0;
      const holdingDays = weightedHoldingDays / matchedQty;
      const tag = tx.tag?.trim() || tagByAsset.get(assetKey) || 'Uncategorized';

      closedTrades.push({
        symbol: tx.symbol.toUpperCase(),
        marketType: tx.market_type,
        tag,
        quantity: matchedQty,
        pnl,
        cost: matchedCostBase,
        proceeds: proceedsBase,
        returnPct,
        holdingDays,
        closedAt: tx.transaction_date,
      });

      if (pnl >= 0) grossProfit += pnl;
      else grossLoss += pnl;

      const assetAgg = ensureAgg(byAssetAgg, assetKey);
      assetAgg.realizedPnL += pnl;
      assetAgg.totalPnL += pnl;
      assetAgg.trades += 1;
      if (pnl > 0) assetAgg.wins += 1;

      const marketAgg = ensureAgg(byMarketAgg, tx.market_type);
      marketAgg.realizedPnL += pnl;
      marketAgg.totalPnL += pnl;
      marketAgg.trades += 1;
      if (pnl > 0) marketAgg.wins += 1;

      const tagAgg = ensureAgg(byTagAgg, tag);
      tagAgg.realizedPnL += pnl;
      tagAgg.totalPnL += pnl;
      tagAgg.trades += 1;
      if (pnl > 0) tagAgg.wins += 1;

      const holdingAcc = holdingAccByAsset.get(assetKey) || { daysQty: 0, qty: 0 };
      holdingAcc.daysQty += weightedHoldingDays;
      holdingAcc.qty += matchedQty;
      holdingAccByAsset.set(assetKey, holdingAcc);
    }

    const remainingCostByAsset = new Map<string, number>();
    for (const [assetKey, lots] of lotsByAsset.entries()) {
      let costBase = 0;
      for (const lot of lots) {
        costBase += await converter.convert(lot.costPerUnit * lot.qty, lot.currency, baseCurrency);
        const openHoldingDays = Math.max(
          0,
          (Date.now() - lot.date.getTime()) / (1000 * 60 * 60 * 24)
        );
        const holdingAcc = holdingAccByAsset.get(assetKey) || { daysQty: 0, qty: 0 };
        holdingAcc.daysQty += openHoldingDays * lot.qty;
        holdingAcc.qty += lot.qty;
        holdingAccByAsset.set(assetKey, holdingAcc);
      }
      remainingCostByAsset.set(assetKey, costBase);
    }

    const totalCurrentValue = holdingsValuation.totalValue;
    const nonCashCurrentValue = holdingsValuation.assetDetails
      .filter((detail) => detail.asset.market_type !== 'CASH')
      .reduce((sum, detail) => sum + detail.value, 0);

    for (const detail of holdingsValuation.assetDetails) {
      if (detail.asset.market_type === 'CASH') continue;
      const assetKey = keyFor(detail.asset.symbol, detail.asset.market_type);
      const unrealized = detail.value - (remainingCostByAsset.get(assetKey) || 0);

      const assetAgg = ensureAgg(byAssetAgg, assetKey);
      assetAgg.unrealizedPnL += unrealized;
      assetAgg.totalPnL += unrealized;
      assetAgg.currentValue = detail.value;

      const marketAgg = ensureAgg(byMarketAgg, detail.asset.market_type);
      marketAgg.unrealizedPnL += unrealized;
      marketAgg.totalPnL += unrealized;
      marketAgg.currentValue += detail.value;

      const tag = tagByAsset.get(assetKey) || 'Uncategorized';
      const tagAgg = ensureAgg(byTagAgg, tag);
      tagAgg.unrealizedPnL += unrealized;
      tagAgg.totalPnL += unrealized;
      tagAgg.currentValue += detail.value;
    }

    const closedCount = closedTrades.length;
    const winners = closedTrades.filter((t) => t.pnl > 0);
    const losers = closedTrades.filter((t) => t.pnl < 0);
    const winRate = closedCount > 0 ? (winners.length / closedCount) * 100 : 0;
    const avgWin = winners.length ? winners.reduce((s, t) => s + t.pnl, 0) / winners.length : 0;
    const avgLoss = losers.length ? losers.reduce((s, t) => s + Math.abs(t.pnl), 0) / losers.length : 0;
    const profitFactor = Math.abs(grossLoss) > 0 ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? 999 : 0;

    const bestTrade = closedTrades.reduce<ClosedTrade | null>((best, trade) => {
      if (!best || trade.pnl > best.pnl) return trade;
      return best;
    }, null);
    const worstTrade = closedTrades.reduce<ClosedTrade | null>((worst, trade) => {
      if (!worst || trade.pnl < worst.pnl) return trade;
      return worst;
    }, null);

    const avgHoldingDaysWinner = winners.length
      ? winners.reduce((sum, trade) => sum + trade.holdingDays, 0) / winners.length
      : 0;
    const avgHoldingDaysLoser = losers.length
      ? losers.reduce((sum, trade) => sum + trade.holdingDays, 0) / losers.length
      : 0;

    const monthlyMap = new Map<
      string,
      { month: string; realizedPnL: number; trades: number; wins: number; losses: number }
    >();
    for (const trade of closedTrades) {
      const month = trade.closedAt.slice(0, 7);
      const row = monthlyMap.get(month) || { month, realizedPnL: 0, trades: 0, wins: 0, losses: 0 };
      row.realizedPnL += trade.pnl;
      row.trades += 1;
      if (trade.pnl > 0) row.wins += 1;
      if (trade.pnl < 0) row.losses += 1;
      monthlyMap.set(month, row);
    }
    const monthlyPerformance = Array.from(monthlyMap.values())
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 12)
      .map((row) => ({
        ...row,
        winRate: row.trades > 0 ? (row.wins / row.trades) * 100 : 0,
      }));

    const snapshots: Array<{ total_value: number; recorded_at: string }> = [];
    for (let offset = 0; offset < MAX_SNAPSHOT_ROWS; offset += PAGE_SIZE) {
      const to = offset + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('portfolio_snapshots')
        .select('total_value, recorded_at')
        .order('recorded_at', { ascending: true })
        .range(offset, to);
      if (error) break;
      const batch = (data || []) as Array<{ total_value: number; recorded_at: string }>;
      snapshots.push(
        ...batch.filter((point) => new Date(point.recorded_at).getTime() >= cutoffDate.getTime())
      );
      if (batch.length < PAGE_SIZE) break;
    }

    let maxDrawdownPct = 0;
    let drawdownFrom = '';
    let drawdownTo = '';
    let peak = 0;
    let peakDate = '';
    for (const point of snapshots) {
      const value = Number(point.total_value);
      if (!Number.isFinite(value) || value <= 0) continue;
      if (value > peak) {
        peak = value;
        peakDate = point.recorded_at;
      }
      if (peak > 0) {
        const dd = ((value - peak) / peak) * 100;
        if (dd < maxDrawdownPct) {
          maxDrawdownPct = dd;
          drawdownFrom = peakDate;
          drawdownTo = point.recorded_at;
        }
      }
    }

    const byAsset = Array.from(byAssetAgg.entries())
      .map(([assetKey, agg]): AssetStats => {
        const [symbol, marketType] = assetKey.split(':');
        const allocationPct = totalCurrentValue > 0 ? (agg.currentValue / totalCurrentValue) * 100 : 0;
        const trades = agg.trades;
        const winRateAsset = trades > 0 ? (agg.wins / trades) * 100 : 0;
        const costBasis = remainingCostByAsset.get(assetKey) || 0;
        const investedCapital = investedByAsset.get(assetKey) || 0;
        const returnPct = investedCapital > 0 ? (agg.totalPnL / investedCapital) * 100 : 0;
        const holdingAcc = holdingAccByAsset.get(assetKey) || { daysQty: 0, qty: 0 };
        const avgHoldingDays = holdingAcc.qty > 0 ? holdingAcc.daysQty / holdingAcc.qty : 0;
        const tag = tagByAsset.get(assetKey) || 'Uncategorized';
        return {
          symbol,
          name: assetNameByKey.get(assetKey) || symbol,
          marketType: marketType as MarketType,
          tag,
          currentValue: round2(agg.currentValue),
          allocationPct: round2(allocationPct),
          realizedPnL: round2(agg.realizedPnL),
          unrealizedPnL: round2(agg.unrealizedPnL),
          totalPnL: round2(agg.totalPnL),
          costBasis: round2(costBasis),
          investedCapital: round2(investedCapital),
          returnPct: round2(returnPct),
          avgHoldingDays: round2(avgHoldingDays),
          trades,
          winRate: round2(winRateAsset),
        };
      })
      .sort((a, b) => b.currentValue - a.currentValue);

    const toBreakdown = (map: Map<string, AggregateStats>) =>
      Array.from(map.values())
        .map((item) => ({
          key: item.key,
          realizedPnL: round2(item.realizedPnL),
          unrealizedPnL: round2(item.unrealizedPnL),
          totalPnL: round2(item.totalPnL),
          currentValue: round2(item.currentValue),
          trades: item.trades,
          winRate: item.trades > 0 ? round2((item.wins / item.trades) * 100) : 0,
        }))
        .sort((a, b) => b.totalPnL - a.totalPnL);

    const byMarket = toBreakdown(byMarketAgg);
    const byTag = toBreakdown(byTagAgg);

    const tradeChronological = [...closedTrades].sort((a, b) => a.closedAt.localeCompare(b.closedAt));
    let currentLossStreak = 0;
    let maxLossStreak = 0;
    for (const trade of tradeChronological) {
      if (trade.pnl < 0) {
        currentLossStreak += 1;
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
      } else {
        currentLossStreak = 0;
      }
    }

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const trades30d = closedTrades.filter((trade) => new Date(trade.closedAt).getTime() >= thirtyDaysAgo).length;

    const positionOptimization: string[] = [];
    const topPositions = [...byAsset].sort((a, b) => b.allocationPct - a.allocationPct);
    for (const asset of topPositions) {
      if (asset.allocationPct >= 35) {
        pushInsight(
          positionOptimization,
          `${asset.symbol} 仓位占比 ${asset.allocationPct}% 偏高，建议设置上限并分批降仓。`
        );
      }
      if (asset.allocationPct >= 20 && asset.unrealizedPnL < 0) {
        pushInsight(
          positionOptimization,
          `${asset.symbol} 高仓位且处于浮亏，建议减仓并设置风控触发位。`
        );
      }
      if (asset.allocationPct <= 10 && asset.totalPnL > 0 && asset.winRate >= 60 && asset.trades >= 3) {
        pushInsight(
          positionOptimization,
          `${asset.symbol} 历史表现稳定（胜率 ${asset.winRate}%），可考虑在回撤时逐步加仓。`
        );
      }
    }

    const strategyActions: string[] = [];
    for (const row of byTag) {
      if (row.trades >= 3 && row.totalPnL < 0) {
        pushInsight(strategyActions, `标签 ${row.key} 累计为负，建议降低权重或暂停该策略。`);
      }
      if (row.trades >= 3 && row.totalPnL > 0 && row.winRate >= 55) {
        pushInsight(strategyActions, `标签 ${row.key} 胜率与收益均为正，可作为优先加仓方向。`);
      }
    }
    for (const row of byMarket) {
      if (row.trades >= 3 && row.totalPnL < 0) {
        pushInsight(strategyActions, `${row.key} 市场阶段性失效，建议收缩仓位并降低频次。`);
      }
      if (row.trades >= 3 && row.totalPnL > 0 && row.winRate >= 55) {
        pushInsight(strategyActions, `${row.key} 市场当前效率更高，可提高配置上限。`);
      }
    }

    const behaviorCorrections: string[] = [];
    if (avgHoldingDaysWinner > 0 && avgHoldingDaysLoser > avgHoldingDaysWinner * 1.5) {
      pushInsight(behaviorCorrections, '亏损仓位持有时间明显长于盈利仓位，存在“扛亏”倾向，建议设置硬止损。');
    }
    if (avgWin > 0 && avgLoss > avgWin * 1.2) {
      pushInsight(behaviorCorrections, '平均亏损大于平均盈利，建议缩小单笔风险并优化止盈止损比。');
    }
    if (maxLossStreak >= 3) {
      pushInsight(behaviorCorrections, `最大连续亏损达到 ${maxLossStreak} 笔，建议触发“连亏暂停交易”规则。`);
    }
    if (trades30d >= 30 && winRate < 45) {
      pushInsight(behaviorCorrections, '近30天交易频率较高且胜率偏低，存在过度交易倾向。');
    }

    const realizedPnL = round2(closedTrades.reduce((sum, t) => sum + t.pnl, 0));
    const unrealizedPnL = round2(byAsset.reduce((sum, a) => sum + a.unrealizedPnL, 0));
    const totalPnL = round2(realizedPnL + unrealizedPnL);
    const totalReturnPct = netInvested > 0 ? round2((totalPnL / netInvested) * 100) : 0;
    const recentClosedTrades = [...closedTrades]
      .sort((a, b) => b.closedAt.localeCompare(a.closedAt))
      .slice(0, 20)
      .map((trade) => ({
        symbol: trade.symbol,
        marketType: trade.marketType,
        tag: trade.tag,
        quantity: round2(trade.quantity),
        pnl: round2(trade.pnl),
        returnPct: round2(trade.returnPct),
        holdingDays: round2(trade.holdingDays),
        closedAt: trade.closedAt,
      }));
    const closedTradesInRange = [...closedTrades]
      .sort((a, b) => b.closedAt.localeCompare(a.closedAt))
      .slice(0, 300)
      .map((trade) => ({
        symbol: trade.symbol,
        marketType: trade.marketType,
        tag: trade.tag,
        quantity: round2(trade.quantity),
        pnl: round2(trade.pnl),
        returnPct: round2(trade.returnPct),
        holdingDays: round2(trade.holdingDays),
        closedAt: trade.closedAt,
      }));

    const payload = {
      timeRange,
      rangeStart: cutoffDate.toISOString(),
      baseCurrency,
      generatedAt: new Date().toISOString(),
      reviewPanel: {
        currentValue: round2(totalCurrentValue),
        nonCashValue: round2(nonCashCurrentValue),
        netInvested: round2(netInvested),
        totalPnL,
        totalReturnPct,
        realizedPnL,
        unrealizedPnL,
        closedTrades: closedCount,
        winRate: round2(winRate),
        avgWin: round2(avgWin),
        avgLoss: round2(avgLoss),
        profitFactor: round2(profitFactor),
        maxDrawdownPct: round2(maxDrawdownPct),
        drawdownFrom,
        drawdownTo,
        bestTrade: bestTrade
          ? { symbol: bestTrade.symbol, pnl: round2(bestTrade.pnl), returnPct: round2(bestTrade.returnPct), closedAt: bestTrade.closedAt }
          : null,
        worstTrade: worstTrade
          ? { symbol: worstTrade.symbol, pnl: round2(worstTrade.pnl), returnPct: round2(worstTrade.returnPct), closedAt: worstTrade.closedAt }
          : null,
      },
      breakdowns: {
        byAsset,
        byMarket,
        byTag,
        monthlyPerformance: monthlyPerformance.map((row) => ({
          ...row,
          realizedPnL: round2(row.realizedPnL),
          winRate: round2(row.winRate),
        })),
      },
      positionOptimization,
      strategyActions,
      behaviorCorrections,
      behaviorStats: {
        avgHoldingDaysWinner: round2(avgHoldingDaysWinner),
        avgHoldingDaysLoser: round2(avgHoldingDaysLoser),
        maxLossStreak,
        trades30d,
      },
      recentClosedTrades,
      closedTradesInRange,
    };

    cacheMap.set(markerKey, {
      payload,
      generatedAt: Date.now(),
    });

    if (cacheMap.size > 20) {
      const staleKey = cacheMap.keys().next().value;
      if (staleKey) cacheMap.delete(staleKey);
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Analytics route failed:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
