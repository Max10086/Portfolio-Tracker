import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { calculatePortfolioTotal, type Asset } from '@/lib/price-service';

/**
 * API Route: POST /api/cron/update-nav
 *
 * Creates an immutable snapshot of the portfolio's total value at the current moment.
 * - Fetches current live prices for all holdings
 * - Calculates Total Portfolio Value = Sum(Asset Quantity * Current Price * Exchange Rate)
 * - INSERTs a new row into portfolio_snapshots (never modifies or deletes old records)
 * - Supports running multiple times per day (stores full timestamps)
 *
 * Past data points are static history and must never be overwritten.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const urlSecret = request.nextUrl.searchParams.get('cron_secret');

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`&& 
      urlSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const baseCurrency = process.env.BASE_CURRENCY || 'USD';

    // Fetch current holdings from transactions-derived view (not legacy assets table)
    let holdings: Array<{ symbol: string; market_type: string; quantity: number }> = [];

    const { data: viewData, error: viewError } = await supabase
      .from('current_holdings')
      .select('symbol, market_type, quantity');

    if (!viewError && viewData && viewData.length > 0) {
      holdings = viewData.map((h) => ({
        symbol: h.symbol,
        market_type: h.market_type,
        quantity: Number(h.quantity),
      }));
    } else {
      // Fallback: compute from transactions table
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('symbol, market_type, transaction_type, quantity');

      if (txError || !transactions || transactions.length === 0) {
        holdings = [];
      } else {
        const map = new Map<string, number>();
        for (const tx of transactions) {
          const key = `${tx.symbol}:${tx.market_type}`;
          const qty = tx.transaction_type === 'BUY' ? tx.quantity : -tx.quantity;
          map.set(key, (map.get(key) || 0) + qty);
        }
        holdings = Array.from(map.entries())
          .filter(([, q]) => q > 0)
          .map(([k, q]) => {
            const [symbol, market_type] = k.split(':');
            return { symbol, market_type, quantity: q };
          });
      }
    }

    let totalValue = 0;

    if (holdings.length > 0) {
      const assets: Asset[] = holdings.map((h, idx) => ({
        id: `${h.symbol}-${idx}`,
        symbol: h.symbol,
        market_type: h.market_type as Asset['market_type'],
        quantity: h.quantity,
      }));

      try {
        const result = await calculatePortfolioTotal({
          assets,
          baseCurrency,
          failOnPriceError: true,
        });
        totalValue = result.totalValue;
      } catch (err) {
        console.error('Error calculating portfolio total:', err);
        return NextResponse.json(
          {
            error: 'Failed to calculate portfolio total',
            details: err instanceof Error ? err.message : 'Unknown error',
          },
          { status: 500 }
        );
      }
    }

    // INSERT only - never modify or delete existing rows
    const recordedAt = new Date().toISOString();

    const { error: insertError } = await supabase.from('portfolio_snapshots').insert({
      total_value: totalValue,
      recorded_at: recordedAt,
    });

    if (insertError) {
      console.error('Error inserting portfolio snapshot:', insertError);
      return NextResponse.json(
        { error: 'Failed to insert portfolio snapshot', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      totalValue,
      baseCurrency,
      assetCount: holdings.length,
      timestamp: recordedAt,
    });
  } catch (error) {
    console.error('Unexpected error in update-nav endpoint:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Also support GET for manual testing (optional)
export async function GET(request: NextRequest) {
  return POST(request);
}

