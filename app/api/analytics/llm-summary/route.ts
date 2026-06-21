import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface AnalyticsPayload {
  timeRange?: string;
  rangeStart?: string;
  baseCurrency: string;
  generatedAt: string;
  reviewPanel: {
    currentValue: number;
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
  };
  breakdowns: {
    byAsset: Array<{
      symbol: string;
      name: string;
      marketType: string;
      tag: string;
      allocationPct: number;
      currentValue: number;
      realizedPnL: number;
      unrealizedPnL: number;
      returnPct: number;
      avgHoldingDays: number;
      trades: number;
    }>;
    byMarket: Array<{
      key: string;
      totalPnL: number;
      currentValue: number;
      trades: number;
      winRate: number;
    }>;
    byTag: Array<{
      key: string;
      realizedPnL: number;
      unrealizedPnL: number;
      totalPnL: number;
      currentValue: number;
      trades: number;
      winRate: number;
    }>;
    monthlyPerformance: Array<{
      month: string;
      realizedPnL: number;
      trades: number;
      wins: number;
      losses: number;
      winRate: number;
    }>;
  };
  behaviorStats: {
    avgHoldingDaysWinner: number;
    avgHoldingDaysLoser: number;
    maxLossStreak: number;
    trades30d: number;
  };
  recentClosedTrades?: Array<{
    symbol: string;
    marketType: string;
    tag: string;
    quantity: number;
    pnl: number;
    returnPct: number;
    holdingDays: number;
    closedAt: string;
  }>;
  closedTradesInRange?: Array<{
    symbol: string;
    marketType: string;
    tag: string;
    quantity: number;
    pnl: number;
    returnPct: number;
    holdingDays: number;
    closedAt: string;
  }>;
}

async function fetchAnalyticsPayload(
  request: NextRequest,
  timeRange: string
): Promise<{ ok: true; payload: AnalyticsPayload } | { ok: false; status: number; message: string }> {
  const analyticsUrl = new URL('/api/analytics', request.url);
  analyticsUrl.searchParams.set('timeRange', timeRange);
  const analyticsResponse = await fetch(analyticsUrl.toString(), {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!analyticsResponse.ok) {
    const errorPayload = await analyticsResponse.json().catch(() => ({}));
    return {
      ok: false,
      status: analyticsResponse.status,
      message: errorPayload?.error || `HTTP ${analyticsResponse.status}`,
    };
  }
  const payload = (await analyticsResponse.json()) as AnalyticsPayload;
  return { ok: true, payload };
}

export async function GET(request: NextRequest) {
  try {
    const timeRange = request.nextUrl.searchParams.get('timeRange') || '30d';
    const [allHistoryRes, focusRes] = await Promise.all([
      fetchAnalyticsPayload(request, 'all'),
      fetchAnalyticsPayload(request, timeRange),
    ]);
    if (!allHistoryRes.ok) {
      return NextResponse.json(
        {
          error: 'Failed to fetch all-history analytics payload',
          details: allHistoryRes.message,
        },
        { status: 500 }
      );
    }
    if (!focusRes.ok) {
      return NextResponse.json(
        {
          error: 'Failed to fetch focus-window analytics payload',
          details: focusRes.message,
        },
        { status: 500 }
      );
    }

    const allAnalytics = allHistoryRes.payload;
    const focusAnalytics = focusRes.payload;

    const topAssets = [...focusAnalytics.breakdowns.byAsset]
      .sort((a, b) => b.currentValue - a.currentValue)
      .slice(0, 12);
    const topTags = [...focusAnalytics.breakdowns.byTag].slice(0, 12);
    const topMarkets = [...focusAnalytics.breakdowns.byMarket].slice(0, 12);
    const recentMonths = [...focusAnalytics.breakdowns.monthlyPerformance].slice(0, 12);
    const totalPnL = focusAnalytics.reviewPanel.totalPnL;

    const performanceByTag = topTags.map((tag) => {
      const returnPct = tag.currentValue > 0 ? (tag.totalPnL / tag.currentValue) * 100 : 0;
      const contributionPct = Math.abs(totalPnL) > 0 ? (tag.totalPnL / totalPnL) * 100 : 0;
      const volatilityProxyPct =
        tag.currentValue > 0 ? (Math.abs(tag.unrealizedPnL) / tag.currentValue) * 100 : 0;
      return {
        tag: tag.key,
        return_pct: Number(returnPct.toFixed(2)),
        contribution_pct: Number(contributionPct.toFixed(2)),
        volatility_proxy_pct: Number(volatilityProxyPct.toFixed(2)),
        trade_count: tag.trades,
        current_value: tag.currentValue,
      };
    });

    const performanceByAsset = topAssets.map((asset) => ({
      symbol: asset.symbol,
      name: asset.name,
      market_type: asset.marketType,
      tag: asset.tag,
      return_pct: asset.returnPct,
      avg_holding_days: asset.avgHoldingDays,
      drawdown_pct: null,
      allocation_pct: asset.allocationPct,
      current_value: asset.currentValue,
      realized_pnl: asset.realizedPnL,
      unrealized_pnl: asset.unrealizedPnL,
      trade_count: asset.trades,
    }));

    const behavioralSignals = {
      hold_loser_bias:
        focusAnalytics.behaviorStats.avgHoldingDaysLoser >
        focusAnalytics.behaviorStats.avgHoldingDaysWinner * 1.5,
      overtrading_risk:
        focusAnalytics.behaviorStats.trades30d >= 30 && focusAnalytics.reviewPanel.winRate < 45,
      max_loss_streak: focusAnalytics.behaviorStats.maxLossStreak,
      stop_profit_stop_loss_bias:
        focusAnalytics.reviewPanel.avgLoss > focusAnalytics.reviewPanel.avgWin * 1.2,
      diagnostics: {
        avg_holding_days_winner: focusAnalytics.behaviorStats.avgHoldingDaysWinner,
        avg_holding_days_loser: focusAnalytics.behaviorStats.avgHoldingDaysLoser,
        trades_30d: focusAnalytics.behaviorStats.trades30d,
        avg_win: focusAnalytics.reviewPanel.avgWin,
        avg_loss: focusAnalytics.reviewPanel.avgLoss,
      },
    };

    const recentTradesDigest = (focusAnalytics.recentClosedTrades || []).slice(0, 12).map((trade) => ({
      time: trade.closedAt,
      symbol: trade.symbol,
      reason: trade.tag || 'Uncategorized',
      result: {
        pnl: trade.pnl,
        return_pct: trade.returnPct,
        holding_days: trade.holdingDays,
      },
    }));
    const tradesInFocusRange = (focusAnalytics.closedTradesInRange || focusAnalytics.recentClosedTrades || [])
      .slice(0, 200)
      .map((trade) => ({
        time: trade.closedAt,
        symbol: trade.symbol,
        market_type: trade.marketType,
        reason: trade.tag || 'Uncategorized',
        quantity: trade.quantity,
        pnl: trade.pnl,
        return_pct: trade.returnPct,
        holding_days: trade.holdingDays,
      }));

    const summary = {
      generatedAt: focusAnalytics.generatedAt,
      baseCurrency: focusAnalytics.baseCurrency,
      analysis_window: timeRange,
      historical_context: {
        source_window: 'all',
        generated_at: allAnalytics.generatedAt,
        portfolio_overview: {
          current_value: allAnalytics.reviewPanel.currentValue,
          net_invested: allAnalytics.reviewPanel.netInvested,
          total_pnl: allAnalytics.reviewPanel.totalPnL,
          total_return_pct: allAnalytics.reviewPanel.totalReturnPct,
          max_drawdown_pct: allAnalytics.reviewPanel.maxDrawdownPct,
          drawdown_from: allAnalytics.reviewPanel.drawdownFrom,
          drawdown_to: allAnalytics.reviewPanel.drawdownTo,
        },
        behavior_baseline: allAnalytics.behaviorStats,
        key_contributors: {
          top_assets: [...allAnalytics.breakdowns.byAsset]
            .sort((a, b) => b.currentValue - a.currentValue)
            .slice(0, 20),
          top_tags: [...allAnalytics.breakdowns.byTag].slice(0, 20),
          top_markets: [...allAnalytics.breakdowns.byMarket].slice(0, 20),
        },
      },
      focus_context: {
        source_window: timeRange,
        range_start: focusAnalytics.rangeStart || null,
        generated_at: focusAnalytics.generatedAt,
        trades_in_range: tradesInFocusRange,
      },
      portfolio_overview: {
        current_value: focusAnalytics.reviewPanel.currentValue,
        net_invested: focusAnalytics.reviewPanel.netInvested,
        total_pnl: focusAnalytics.reviewPanel.totalPnL,
        total_return_pct: focusAnalytics.reviewPanel.totalReturnPct,
        max_drawdown_pct: focusAnalytics.reviewPanel.maxDrawdownPct,
        drawdown_from: focusAnalytics.reviewPanel.drawdownFrom,
        drawdown_to: focusAnalytics.reviewPanel.drawdownTo,
      },
      performance_by_tag: performanceByTag,
      performance_by_asset: performanceByAsset,
      behavioral_signals: behavioralSignals,
      recent_trades_digest: recentTradesDigest,
      constraints: {
        risk_profile: 'balanced',
        max_single_position_pct: 25,
        acceptable_drawdown_pct: 12,
        rebalance_frequency: 'weekly',
        custom_notes: '可按用户偏好在前端 Additional Context 中覆盖',
      },
      monthly_performance: recentMonths,
      key_contributors: {
        top_assets: topAssets,
        top_tags: topTags,
        top_markets: topMarkets,
      },
      notes: [
        'AI should use historical_context as long-term behavioral background.',
        'AI should prioritize focus_context and trades_in_range for this review.',
        'Asset returnPct is calculated as totalPnL / investedCapital.',
        'avgHoldingDays includes both closed and currently open lots.',
        'volatility_proxy_pct is a proxy using |unrealizedPnL| / currentValue.',
        'Asset-level drawdown is currently unavailable and set to null.',
      ],
    };

    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to build LLM summary',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
