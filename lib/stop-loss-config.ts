import type { AssetStopLossConfig, StopTierId } from '@/components/position-optimization/types';
import { normalizeAssetNameKey } from '@/lib/asset-name-cache';

export const STOP_LOSS_STORAGE_KEY = 'portfolio-stop-loss-v1';
export const STOP_LOSS_ACK_STORAGE_KEY = 'portfolio-stop-loss-ack-v1';

export interface StopTierAcknowledgement {
  stopPrice: number;
  sellPct: number;
  acknowledgedAt: string;
}

export type StopAckMap = Record<string, StopTierAcknowledgement>;

export function ackStorageKey(assetKey: string, tierId: StopTierId): string {
  return `${assetKey}:${tierId}`;
}

export function parseAssetKey(assetKey: string): { symbol: string; market_type: string } {
  const colon = assetKey.indexOf(':');
  if (colon <= 0) throw new Error(`Invalid asset key: ${assetKey}`);
  return {
    symbol: assetKey.slice(0, colon).trim().toUpperCase(),
    market_type: assetKey.slice(colon + 1).trim().toUpperCase(),
  };
}

export function normalizeStopAssetKey(symbol: string, marketType: string): string {
  return normalizeAssetNameKey(symbol, marketType);
}

/** Stablecoins / cash-like holdings — no stop-loss ladder. */
const STOP_LOSS_EXCLUDED_SYMBOLS = new Set(['USDT', 'USDC']);

export function isAssetEligibleForStopLoss(symbol: string, marketType: string): boolean {
  const market = marketType.trim().toUpperCase();
  if (market === 'CASH') return false;
  const sym = symbol.trim().toUpperCase();
  if (STOP_LOSS_EXCLUDED_SYMBOLS.has(sym)) return false;
  return true;
}

export function isAssetKeyEligibleForStopLoss(assetKey: string): boolean {
  try {
    const { symbol, market_type } = parseAssetKey(assetKey);
    return isAssetEligibleForStopLoss(symbol, market_type);
  } catch {
    return true;
  }
}

export function emptyStopConfig(): AssetStopLossConfig {
  return {
    relief: { price: null, sellPct: null },
    retreat: { price: null, sellPct: null },
    bailout: { price: null, sellPct: null },
  };
}

export function loadStopLossConfigs(): Record<string, AssetStopLossConfig> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STOP_LOSS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, AssetStopLossConfig>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStopLossConfigs(configs: Record<string, AssetStopLossConfig>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STOP_LOSS_STORAGE_KEY, JSON.stringify(configs));
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function loadStopAcknowledgements(): StopAckMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STOP_LOSS_ACK_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StopAckMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStopAcknowledgements(acks: StopAckMap): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STOP_LOSS_ACK_STORAGE_KEY, JSON.stringify(acks));
  } catch {
    // Ignore quota / private mode errors.
  }
}

/** Price recovered above stop — clear ack so the next dip can alert again. */
export function clearAckIfRecovered(
  acks: StopAckMap,
  assetKey: string,
  tierId: StopTierId,
  currentPrice: number,
  stopPrice: number | null
): StopAckMap {
  if (stopPrice == null || currentPrice <= 0) return acks;
  if (currentPrice >= stopPrice) {
    const key = ackStorageKey(assetKey, tierId);
    if (!(key in acks)) return acks;
    const next = { ...acks };
    delete next[key];
    return next;
  }
  return acks;
}

/** Compare threshold values from UI vs Postgres DECIMAL without false mismatches. */
export function stopValuesMatch(a: number, b: number): boolean {
  if (a === b) return true;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= scale * 1e-6;
}

export function parseAckStorageKey(
  storageKey: string
): { assetKey: string; tierId: StopTierId } | null {
  const tiers: StopTierId[] = ['relief', 'retreat', 'bailout'];
  for (const tierId of tiers) {
    const suffix = `:${tierId}`;
    if (storageKey.endsWith(suffix)) {
      const assetKey = storageKey.slice(0, -suffix.length);
      if (assetKey.length > 0 && assetKey.includes(':')) {
        return { assetKey, tierId };
      }
    }
  }
  return null;
}

export function mergeAckMaps(local: StopAckMap, remote: StopAckMap): StopAckMap {
  return { ...local, ...remote };
}

export function isTierAcknowledged(
  acks: StopAckMap,
  assetKey: string,
  tierId: StopTierId,
  stopPrice: number | null,
  sellPct: number | null
): boolean {
  if (stopPrice == null || sellPct == null) return false;
  const entry = acks[ackStorageKey(assetKey, tierId)];
  if (!entry) return false;
  return (
    stopValuesMatch(entry.stopPrice, stopPrice) && stopValuesMatch(entry.sellPct, sellPct)
  );
}

export function acknowledgeTier(
  acks: StopAckMap,
  assetKey: string,
  tierId: StopTierId,
  stopPrice: number,
  sellPct: number
): StopAckMap {
  return {
    ...acks,
    [ackStorageKey(assetKey, tierId)]: {
      stopPrice,
      sellPct,
      acknowledgedAt: new Date().toISOString(),
    },
  };
}

const ALL_TIERS: StopTierId[] = ['relief', 'retreat', 'bailout'];

/** Drop all tier acknowledgements for one asset. */
export function clearAcksForAsset(acks: StopAckMap, assetKey: string): StopAckMap {
  let next = acks;
  let changed = false;
  for (const tierId of ALL_TIERS) {
    const key = ackStorageKey(assetKey, tierId);
    if (key in next) {
      if (!changed) {
        next = { ...next };
        changed = true;
      }
      delete next[key];
    }
  }
  return next;
}

/** Remove saved thresholds for one asset from localStorage. */
export function removeStopLossConfigForAsset(
  configs: Record<string, AssetStopLossConfig>,
  assetKey: string
): Record<string, AssetStopLossConfig> {
  if (!(assetKey in configs)) return configs;
  const next = { ...configs };
  delete next[assetKey];
  return next;
}
