import type { AssetStopLossConfig, StopTierId } from '@/components/position-optimization/types';
import type { StopAckMap } from '@/lib/stop-loss-config';
import { parseAssetKey } from '@/lib/stop-loss-config';

export interface StopLossRemoteState {
  configs: Record<string, AssetStopLossConfig>;
  acks: StopAckMap;
  tableReady: boolean;
}

export async function fetchStopLossRemote(): Promise<StopLossRemoteState> {
  const response = await fetch('/api/stop-loss', { cache: 'no-store' });
  const payload = (await response.json().catch(() => ({}))) as StopLossRemoteState & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to load stop-loss settings');
  }
  return {
    configs: payload.configs || {},
    acks: payload.acks || {},
    tableReady: payload.tableReady !== false,
  };
}

export async function saveStopLossRemote(
  assetKey: string,
  config: AssetStopLossConfig
): Promise<void> {
  const { symbol, market_type } = parseAssetKey(assetKey);
  const response = await fetch('/api/stop-loss', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, market_type, config }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      typeof payload.details === 'string' ? payload.details : payload.error || 'Save failed'
    );
  }
}

export async function ackStopLossRemote(
  assetKey: string,
  tierId: StopTierId,
  stopPrice: number,
  sellPct: number
): Promise<void> {
  const { symbol, market_type } = parseAssetKey(assetKey);
  const response = await fetch('/api/stop-loss/ack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol,
      market_type,
      tier_id: tierId,
      stop_price: stopPrice,
      sell_pct: sellPct,
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Ack failed');
  }
}

export async function clearStopLossAckRemote(
  assetKey: string,
  tierId: StopTierId
): Promise<void> {
  const { symbol, market_type } = parseAssetKey(assetKey);
  const response = await fetch('/api/stop-loss/ack', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, market_type, tier_id: tierId }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Clear ack failed');
  }
}
