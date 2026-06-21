import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { calculatePortfolioTotal, type Asset } from '@/lib/price-service';

interface HoldingAtDate {
  symbol: string;
  market_type: 'US' | 'CN' | 'HK' | 'CRYPTO' | 'CASH';
  quantity: number;
}

/**
 * Calculate current portfolio value from holdings (for manual snapshot recording)
 */
async function calculateCurrentPortfolioValue(
  supabase: ReturnType<typeof createServerClient>,
  baseCurrency: string
): Promise<number | null> {
  let holdings: HoldingAtDate[] = [];

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
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('symbol, market_type, transaction_type, quantity');

    if (txError || !transactions || transactions.length === 0) return null;

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
        return { symbol, market_type: market_type as HoldingAtDate['market_type'], quantity: q };
      });
  }

  if (holdings.length === 0) return 0;

  const assets: Asset[] = holdings.map((h, idx) => ({
    id: `${h.symbol}-${idx}`,
    symbol: h.symbol,
    market_type: h.market_type,
    quantity: h.quantity,
  }));

  try {
    const result = await calculatePortfolioTotal({ assets, baseCurrency });
    return result.totalValue;
  } catch {
    return null;
  }
}

/**
 * GET /api/portfolio-snapshots
 * Fetch immutable portfolio snapshots for chart visualization.
 * Returns ONLY stored records from portfolio_snapshots - no recalculations or generated history.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const searchParams = request.nextUrl.searchParams;
    const days = searchParams.get('days');
    const limit = searchParams.get('limit');
    const baseCurrency = process.env.BASE_CURRENCY || 'USD';

    const PAGE_SIZE = 1000;
    const MAX_ROWS = 20000;

    const buildBaseQuery = () => {
      let q = supabase
        .from('portfolio_snapshots')
        .select('id, total_value, recorded_at')
        // Query latest records first to avoid truncation on large datasets.
        .order('recorded_at', { ascending: false });

      if (days) {
        const daysNum = parseInt(days, 10);
        if (!isNaN(daysNum) && daysNum > 0) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - daysNum);
          q = q.gte('recorded_at', cutoffDate.toISOString());
        }
      }

      return q;
    };

    const limitNum = limit ? parseInt(limit, 10) : NaN;
    const hasValidLimit = !isNaN(limitNum) && limitNum > 0;

    let snapshots: Array<{ id: string; total_value: number; recorded_at: string }> = [];

    if (hasValidLimit && limitNum <= PAGE_SIZE) {
      const { data, error } = await buildBaseQuery().limit(limitNum);
      if (error) {
        console.error('Error fetching portfolio snapshots:', error);
        return NextResponse.json(
          { error: 'Failed to fetch snapshots', details: error.message },
          { status: 500 }
        );
      }
      snapshots = data || [];
    } else {
      for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
        const to = offset + PAGE_SIZE - 1;
        const { data, error } = await buildBaseQuery().range(offset, to);
        if (error) {
          console.error('Error fetching portfolio snapshots:', error);
          return NextResponse.json(
            { error: 'Failed to fetch snapshots', details: error.message },
            { status: 500 }
          );
        }

        const batch = data || [];
        snapshots.push(...batch);

        if (batch.length < PAGE_SIZE) break;
        if (hasValidLimit && snapshots.length >= limitNum) break;
      }

      if (hasValidLimit && snapshots.length > limitNum) {
        snapshots = snapshots.slice(0, limitNum);
      }
    }

    const normalizedSnapshots = (snapshots || []).slice().sort((a, b) =>
      new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
    );

    return NextResponse.json({
      snapshots: normalizedSnapshots,
      baseCurrency,
      source: 'stored',
      message:
        normalizedSnapshots.length === 0
          ? 'No snapshots yet. The cron job records portfolio value periodically. Add transactions and wait for the next snapshot, or use "Record Snapshot" to capture manually.'
          : undefined,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (
      errorMessage.includes('table') ||
      errorMessage.includes('schema cache') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json(
        {
          error: 'Database table not found',
          details: 'Please run the database migrations in Supabase. See SETUP.md for instructions.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * POST /api/portfolio-snapshots
 * Manually record a portfolio snapshot (useful for testing or initial setup)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const baseCurrency = process.env.BASE_CURRENCY || 'USD';

    const totalValue = await calculateCurrentPortfolioValue(supabase, baseCurrency);

    if (totalValue === null) {
      return NextResponse.json(
        { error: 'No assets to calculate', details: 'Add some transactions first' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('portfolio_snapshots')
      .insert({
        total_value: totalValue,
        recorded_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting snapshot:', error);
      return NextResponse.json(
        { error: 'Failed to record snapshot', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      snapshot: data,
      baseCurrency,
      message: 'Snapshot recorded successfully',
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}
