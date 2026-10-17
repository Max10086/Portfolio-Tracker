import type { AssetRow } from '@/components/position-optimization/types';
import { isAssetEligibleForStopLoss } from '@/lib/stop-loss-config';

/** Ignore floating-point dust from holdings aggregation. */
export const MIN_OPEN_POSITION_QTY = 1e-6;

export function isOpenPosition(
  asset: Pick<
    AssetRow,
    'quantity' | 'currentPrice' | 'symbol' | 'marketType' | 'hasOpenPosition'
  >
): boolean {
  if (asset.hasOpenPosition === false) return false;
  const qty = Number(asset.quantity ?? 0);
  if (!Number.isFinite(qty) || qty <= MIN_OPEN_POSITION_QTY) return false;
  const price = Number(asset.currentPrice ?? 0);
  if (!Number.isFinite(price) || price <= 0) return false;
  return isAssetEligibleForStopLoss(asset.symbol, asset.marketType);
}

/** `null` = server keys not loaded yet; otherwise use `current_holdings` as source of truth. */
export function isOpenPositionKey(
  assetKey: string,
  openPositionKeys: ReadonlySet<string> | null
): boolean {
  if (openPositionKeys === null) return true;
  return openPositionKeys.has(assetKey);
}
