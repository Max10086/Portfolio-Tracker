import { createServerClient } from '@/lib/supabase';
import { normalizeAssetNameKey } from '@/lib/asset-name-cache';
import { resolveAssetDisplayNames, type MarketType } from '@/lib/price-service';

type AssetPair = { symbol: string; market_type: MarketType };

/** Re-export key helper aligned with client cache (symbol uppercased). */
export function displayNameKey(symbol: string, marketType: string): string {
  return normalizeAssetNameKey(symbol, marketType);
}

export async function loadDisplayNamesFromDb(
  assets: AssetPair[]
): Promise<Record<string, string>> {
  if (assets.length === 0) return {};

  const symbols = [...new Set(assets.map((a) => a.symbol))];
  const wanted = new Set(assets.map((a) => displayNameKey(a.symbol, a.market_type)));

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('asset_display_names')
      .select('symbol, market_type, display_name')
      .in('symbol', symbols);

    if (error) {
      console.warn('[asset_display_names] DB read skipped:', error.message);
      return {};
    }

    const names: Record<string, string> = {};
    for (const row of data || []) {
      const key = displayNameKey(row.symbol, row.market_type);
      if (!wanted.has(key)) continue;
      const name = String(row.display_name || '').trim();
      if (name) names[key] = name;
    }
    return names;
  } catch (err) {
    console.warn('[asset_display_names] DB unavailable:', err);
    return {};
  }
}

export async function persistDisplayNamesToDb(names: Record<string, string>): Promise<void> {
  const rows = Object.entries(names).map(([key, display_name]) => {
    const colon = key.indexOf(':');
    const symbol = key.slice(0, colon);
    const market_type = key.slice(colon + 1);
    return { symbol, market_type, display_name };
  });

  if (rows.length === 0) return;

  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('asset_display_names').upsert(rows, {
      onConflict: 'symbol,market_type',
    });
    if (error) {
      console.warn('[asset_display_names] DB upsert skipped:', error.message);
    }
  } catch (err) {
    console.warn('[asset_display_names] DB upsert failed:', err);
  }
}

export async function resolveDisplayNamesWithCache(
  assets: AssetPair[]
): Promise<Record<string, string>> {
  const fromDb = await loadDisplayNamesFromDb(assets);
  const merged: Record<string, string> = { ...fromDb };

  const missing = assets.filter(
    (a) => !merged[displayNameKey(a.symbol, a.market_type)]
  );
  if (missing.length === 0) return merged;

  const resolved = await resolveAssetDisplayNames(missing);
  Object.assign(merged, resolved);

  const toPersist: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolved)) {
    if (value?.trim()) toPersist[key] = value.trim();
  }
  await persistDisplayNamesToDb(toPersist);

  return merged;
}
