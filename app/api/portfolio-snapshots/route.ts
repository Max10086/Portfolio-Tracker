import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { calculatePortfolioTotal, type Asset } from '@/lib/price-service';

interface Transaction {
  symbol: string;
  market_type: 'US' | 'CN' | 'HK' | 'CRYPTO';
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  transaction_date: string;
}

interface HoldingAtDate {
  symbol: string;
  market_type: 'US' | 'CN' | 'HK' | 'CRYPTO';
  quantity: number;
}

/**
 * Calculate holdings at a specific date based on transactions
 */
function calculateHoldingsAtDate(transactions: Transaction[], targetDate: Date): HoldingAtDate[] {
  const holdingsMap = new Map<string, HoldingAtDate>();

  for (const tx of transactions) {
    const txDate = new Date(tx.transaction_date);
    if (txDate > targetDate) continue; // Skip transactions after target date

    const key = `${tx.symbol}:${tx.market_type}`;
    const qty = tx.transaction_type === 'BUY' ? tx.quantity : -tx.quantity;
    
    const existing = holdingsMap.get(key);
    if (existing) {
      existing.quantity += qty;
    } else {
      holdingsMap.set(key, {
        symbol: tx.symbol,
        market_type: tx.market_type,
        quantity: qty,
      });
    }
  }

  return Array.from(holdingsMap.values()).filter(h => h.quantity > 0);
}

/**
 * GET /api/portfolio-snapshots
 * Fetch portfolio snapshots for chart visualization
 * 
 * If no stored snapshots exist, calculates historical values from transactions
 * Optional query params: limit, days, includeHistory (generates from transactions)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const searchParams = request.nextUrl.searchParams;
    const days = searchParams.get('days');
    const limit = searchParams.get('limit');
    const includeHistory = searchParams.get('includeHistory') === 'true';
    const baseCurrency = process.env.BASE_CURRENCY || 'USD';

    // First, try to fetch stored snapshots
    let query = supabase
      .from('portfolio_snapshots')
      .select('id, total_value, recorded_at')
      .order('recorded_at', { ascending: true });

    if (days) {
      const daysNum = parseInt(days, 10);
      if (!isNaN(daysNum) && daysNum > 0) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysNum);
        query = query.gte('recorded_at', cutoffDate.toISOString());
      }
    }

    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        query = query.limit(limitNum);
      }
    }

    const { data: storedSnapshots, error: snapshotsError } = await query;

    // If there are stored snapshots, return them
    if (!snapshotsError && storedSnapshots && storedSnapshots.length > 0) {
      return NextResponse.json({
        snapshots: storedSnapshots,
        baseCurrency,
        source: 'stored',
      });
    }

    // No stored snapshots - calculate from transactions if requested
    if (includeHistory) {
      return await generateHistoryFromTransactions(supabase, baseCurrency, parseInt(days || '30', 10));
    }

    // No stored snapshots and no history generation requested
    // Calculate current portfolio value and return as a single point
    const currentValue = await calculateCurrentPortfolioValue(supabase, baseCurrency);
    
    if (currentValue !== null) {
      return NextResponse.json({
        snapshots: [{
          id: 'current',
          total_value: currentValue,
          recorded_at: new Date().toISOString(),
        }],
        baseCurrency,
        source: 'calculated',
        message: 'No historical data available. Showing current portfolio value. Add transactions to generate history.',
      });
    }

    // No transactions at all
    return NextResponse.json({
      snapshots: [],
      baseCurrency,
      source: 'empty',
      message: 'No transactions found. Add your first transaction to start tracking.',
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('table') || errorMessage.includes('schema cache') || errorMessage.includes('does not exist')) {
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
 * Calculate current portfolio value from transactions
 */
async function calculateCurrentPortfolioValue(supabase: ReturnType<typeof createServerClient>, baseCurrency: string): Promise<number | null> {
  // First try using current_holdings view
  let holdings: HoldingAtDate[] = [];
  
  const { data: viewData, error: viewError } = await supabase
    .from('current_holdings')
    .select('symbol, market_type, quantity');

  if (!viewError && viewData && viewData.length > 0) {
    holdings = viewData.map(h => ({
      symbol: h.symbol,
      market_type: h.market_type,
      quantity: Number(h.quantity),
    }));
  } else {
    // Fall back to calculating from transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('symbol, market_type, transaction_type, quantity');

    if (txError || !transactions || transactions.length === 0) {
      return null;
    }

    holdings = calculateHoldingsAtDate(
      transactions as Transaction[],
      new Date()
    );
  }

  if (holdings.length === 0) {
    return 0;
  }

  // Calculate total value with current prices
  const assets: Asset[] = holdings.map((h, idx) => ({
    id: `${h.symbol}-${idx}`,
    symbol: h.symbol,
    market_type: h.market_type,
    quantity: h.quantity,
  }));

  try {
    const result = await calculatePortfolioTotal({ assets, baseCurrency });
    return result.totalValue;
  } catch (error) {
    console.error('Error calculating portfolio value:', error);
    return null;
  }
}

/**
 * Generate historical snapshots from transactions
 * Uses current prices for all historical calculations (simplified approach)
 */
async function generateHistoryFromTransactions(
  supabase: ReturnType<typeof createServerClient>,
  baseCurrency: string,
  daysBack: number
): Promise<NextResponse> {
  try {
    // Fetch all transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('symbol, market_type, transaction_type, quantity, transaction_date')
      .order('transaction_date', { ascending: true });

    if (txError) {
      console.error('Error fetching transactions:', txError);
      return NextResponse.json({
        snapshots: [],
        baseCurrency,
        error: 'Failed to fetch transactions',
      });
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({
        snapshots: [],
        baseCurrency,
        source: 'calculated',
        message: 'No transactions found.',
      });
    }

    // Find date range
    const earliestTx = new Date(transactions[0].transaction_date);
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    
    const startDate = earliestTx > cutoffDate ? earliestTx : cutoffDate;
    
    // Generate daily snapshots
    const snapshots: Array<{ id: string; total_value: number; recorded_at: string }> = [];
    const currentDate = new Date(startDate);
    
    // Get current prices once (we'll use these for all historical calculations)
    // This is a simplification - ideally we'd fetch historical prices
    const allHoldings = calculateHoldingsAtDate(transactions as Transaction[], now);
    
    // Store prices converted to base currency (price per unit in base currency)
    let pricesInBaseCurrency: Map<string, number> = new Map();
    
    if (allHoldings.length > 0) {
      const assets: Asset[] = allHoldings.map((h, idx) => ({
        id: `${h.symbol}-${idx}`,
        symbol: h.symbol,
        market_type: h.market_type,
        quantity: h.quantity,
      }));

      try {
        const result = await calculatePortfolioTotal({ assets, baseCurrency });
        for (const detail of result.assetDetails) {
          // Calculate price per unit in base currency
          // detail.value is already converted to base currency (price * quantity * exchangeRate)
          // So price per unit in base currency = detail.value / detail.asset.quantity
          const pricePerUnitInBaseCurrency = detail.asset.quantity > 0 
            ? detail.value / detail.asset.quantity 
            : 0;
          pricesInBaseCurrency.set(
            `${detail.asset.symbol}:${detail.asset.market_type}`, 
            pricePerUnitInBaseCurrency
          );
        }
      } catch (error) {
        console.error('Error fetching prices:', error);
        // Continue with empty prices - values will be 0
      }
    }

    // Generate snapshots for each day
    while (currentDate <= now) {
      const holdingsAtDate = calculateHoldingsAtDate(transactions as Transaction[], currentDate);
      
      let totalValue = 0;
      for (const holding of holdingsAtDate) {
        // Use prices already converted to base currency
        const priceInBaseCurrency = pricesInBaseCurrency.get(`${holding.symbol}:${holding.market_type}`);
        if (priceInBaseCurrency) {
          totalValue += holding.quantity * priceInBaseCurrency;
        }
      }

      snapshots.push({
        id: `generated-${currentDate.toISOString()}`,
        total_value: totalValue,
        recorded_at: new Date(currentDate).toISOString(),
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return NextResponse.json({
      snapshots,
      baseCurrency,
      source: 'generated',
      message: 'Historical data generated from transactions using current prices.',
    });
  } catch (error) {
    console.error('Error generating history:', error);
    return NextResponse.json({
      snapshots: [],
      baseCurrency,
      error: 'Failed to generate history',
      details: (error as Error).message,
    });
  }
}

/**
 * POST /api/portfolio-snapshots
 * Manually record a portfolio snapshot (useful for testing)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const baseCurrency = process.env.BASE_CURRENCY || 'USD';

    // Calculate current portfolio value
    const totalValue = await calculateCurrentPortfolioValue(supabase, baseCurrency);

    if (totalValue === null) {
      return NextResponse.json(
        { error: 'No assets to calculate', details: 'Add some transactions first' },
        { status: 400 }
      );
    }

    // Insert snapshot
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
