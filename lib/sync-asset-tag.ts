import type { SupabaseClient } from '@supabase/supabase-js';

/** Apply the same tag to every transaction for symbol + market_type. */
export async function syncTagForAssetTransactions(
  supabase: SupabaseClient,
  symbol: string,
  marketType: string,
  tag: string | null
): Promise<{ error: { message: string } | null }> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const tagValue = tag?.trim() ? tag.trim() : null;

  const { error } = await supabase
    .from('transactions')
    .update({ tag: tagValue })
    .eq('symbol', normalizedSymbol)
    .eq('market_type', marketType);

  return { error: error ? { message: error.message } : null };
}

export function buildTagByAssetFromTransactions<
  T extends { symbol: string; market_type: string; tag: string | null; transaction_date: string; created_at: string }
>(transactions: T[], keyFor: (symbol: string, marketType: string) => string): Map<string, string> {
  const tagByAsset = new Map<string, string>();
  const sorted = [...transactions].sort((a, b) => {
    const dateDiff =
      new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  for (const tx of sorted) {
    if (tx.tag?.trim()) {
      tagByAsset.set(keyFor(tx.symbol, tx.market_type), tx.tag.trim());
    }
  }
  return tagByAsset;
}
