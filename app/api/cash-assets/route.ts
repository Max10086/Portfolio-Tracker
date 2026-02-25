import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * GET /api/cash-assets
 * Returns available cash holdings for the "Update Cash Balance" dropdown.
 * Always includes USD, CNY, HKD (with 0 balance if no holdings).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();

    const { data: holdings, error } = await supabase
      .from('current_holdings')
      .select('symbol, quantity')
      .eq('market_type', 'CASH');

    if (error) {
      console.error('Error fetching cash holdings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch cash assets', details: error.message },
        { status: 500 }
      );
    }

    const balanceMap: Record<string, number> = { USD: 0, CNY: 0, HKD: 0 };
    for (const h of holdings || []) {
      const sym = String(h.symbol).toUpperCase();
      if (['USD', 'CNY', 'HKD'].includes(sym)) {
        balanceMap[sym] = Number(h.quantity);
      }
    }

    const cashAssets = [
      { symbol: 'USD', quantity: balanceMap.USD, label: 'USD Cash' },
      { symbol: 'CNY', quantity: balanceMap.CNY, label: 'CNY Cash' },
      { symbol: 'HKD', quantity: balanceMap.HKD, label: 'HKD Cash' },
    ];

    return NextResponse.json({ cashAssets });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}
