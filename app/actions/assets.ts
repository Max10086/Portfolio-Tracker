'use server';

import { createServerClient } from '@/lib/supabase';

/**
 * Updates the tag for ALL transactions matching the given symbol and market type.
 * This ensures consistency: if AAPL is tagged as "Tech", all historical AAPL transactions
 * are conceptually "Tech".
 */
export async function updateHoldingTag(
  symbol: string,
  marketType: string,
  newTag: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServerClient();

    const normalizedSymbol = symbol.trim().toUpperCase();
    const validMarketTypes = ['US', 'CN', 'HK', 'CRYPTO', 'CASH'];
    if (!validMarketTypes.includes(marketType)) {
      return { success: false, error: 'Invalid market type' };
    }

    const tagValue = newTag.trim() || null;

    const { error } = await supabase
      .from('transactions')
      .update({ tag: tagValue })
      .eq('symbol', normalizedSymbol)
      .eq('market_type', marketType);

    if (error) {
      console.error('Error updating holding tag:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error in updateHoldingTag:', err);
    return { success: false, error: message };
  }
}
