/** Client-side persistent cache for symbol display names (Position Optimization). */

export const ASSET_NAME_CACHE_STORAGE_KEY = 'portfolio-asset-display-names-v1';

export function normalizeAssetNameKey(symbol: string, marketType: string): string {
  return `${symbol.trim().toUpperCase()}:${marketType.trim().toUpperCase()}`;
}

export function loadAssetNameCache(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(ASSET_NAME_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== 'object') return {};
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const [symbol, marketType] = key.split(':');
      if (!symbol || !marketType) continue;
      normalized[normalizeAssetNameKey(symbol, marketType)] = value.trim();
    }
    return normalized;
  } catch {
    return {};
  }
}

export function saveAssetNameCache(names: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ASSET_NAME_CACHE_STORAGE_KEY, JSON.stringify(names));
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function mergeAssetNameCache(incoming: Record<string, string>): Record<string, string> {
  const prev = loadAssetNameCache();
  const next = { ...prev };
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value === 'string' && value.trim()) {
      next[key] = value.trim();
    }
  }
  saveAssetNameCache(next);
  return next;
}

/** Keys that still need resolution (not in cache or empty). */
export function listMissingAssetNameKeys(
  assets: Array<{ symbol: string; market_type: string }>,
  cached: Record<string, string>
): Array<{ symbol: string; market_type: string; key: string }> {
  const unique = new Map<string, { symbol: string; market_type: string; key: string }>();
  for (const asset of assets) {
    const key = normalizeAssetNameKey(asset.symbol, asset.market_type);
    if (unique.has(key)) continue;
    const hit = cached[key]?.trim();
    if (hit) continue;
    unique.set(key, {
      symbol: asset.symbol.trim().toUpperCase(),
      market_type: asset.market_type.trim().toUpperCase(),
      key,
    });
  }
  return [...unique.values()];
}
