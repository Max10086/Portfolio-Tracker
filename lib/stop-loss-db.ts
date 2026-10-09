import { createServerClient } from '@/lib/supabase';
import { normalizeAssetNameKey } from '@/lib/asset-name-cache';
import type { AssetStopLossConfig, StopTierId } from '@/components/position-optimization/types';
import type { StopAckMap, StopTierAcknowledgement } from '@/lib/stop-loss-config';
import { ackStorageKey, emptyStopConfig, parseAssetKey } from '@/lib/stop-loss-config';

type MarketType = 'US' | 'CN' | 'HK' | 'CRYPTO' | 'CASH';

function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function rowToConfig(row: Record<string, unknown>): AssetStopLossConfig {
  return {
    relief: {
      price: numOrNull(row.relief_price),
      sellPct: numOrNull(row.relief_sell_pct),
    },
    retreat: {
      price: numOrNull(row.retreat_price),
      sellPct: numOrNull(row.retreat_sell_pct),
    },
    bailout: {
      price: numOrNull(row.bailout_price),
      sellPct: numOrNull(row.bailout_sell_pct),
    },
  };
}

function configToRow(symbol: string, market_type: MarketType, config: AssetStopLossConfig) {
  return {
    symbol: symbol.toUpperCase(),
    market_type,
    relief_price: config.relief.price,
    relief_sell_pct: config.relief.sellPct,
    retreat_price: config.retreat.price,
    retreat_sell_pct: config.retreat.sellPct,
    bailout_price: config.bailout.price,
    bailout_sell_pct: config.bailout.sellPct,
    updated_at: new Date().toISOString(),
  };
}

function isMissingTableError(message: string): boolean {
  return (
    message.includes('asset_stop_loss') &&
    (message.includes('does not exist') || message.includes('schema cache'))
  );
}

export async function fetchAllStopLossFromDb(): Promise<{
  configs: Record<string, AssetStopLossConfig>;
  acks: StopAckMap;
  tableReady: boolean;
}> {
  const configs: Record<string, AssetStopLossConfig> = {};
  const acks: StopAckMap = {};

  try {
    const supabase = createServerClient();

    const { data: rows, error: configError } = await supabase.from('asset_stop_loss').select('*');

    if (configError) {
      if (isMissingTableError(configError.message)) {
        return { configs, acks, tableReady: false };
      }
      throw configError;
    }

    for (const row of rows || []) {
      const key = normalizeAssetNameKey(String(row.symbol), String(row.market_type));
      configs[key] = rowToConfig(row as Record<string, unknown>);
    }

    const { data: ackRows, error: ackError } = await supabase.from('asset_stop_loss_ack').select('*');

    if (ackError) {
      if (isMissingTableError(ackError.message)) {
        return { configs, acks, tableReady: false };
      }
      throw ackError;
    }

    for (const row of ackRows || []) {
      const symbol = String(row.symbol);
      const marketType = String(row.market_type);
      const tierId = String(row.tier_id) as StopTierId;
      const assetKey = normalizeAssetNameKey(symbol, marketType);
      const entry: StopTierAcknowledgement = {
        stopPrice: Number(row.stop_price),
        sellPct: Number(row.sell_pct),
        acknowledgedAt: String(row.acknowledged_at),
      };
      acks[ackStorageKey(assetKey, tierId)] = entry;
    }

    return { configs, acks, tableReady: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isMissingTableError(message)) {
      return { configs, acks, tableReady: false };
    }
    throw err;
  }
}

export async function upsertStopLossConfig(
  assetKey: string,
  config: AssetStopLossConfig
): Promise<void> {
  const parsed = parseAssetKey(assetKey);
  const symbol = parsed.symbol;
  const market_type = parsed.market_type as MarketType;
  const supabase = createServerClient();
  const row = configToRow(symbol, market_type, config);

  const { error } = await supabase.from('asset_stop_loss').upsert(row, {
    onConflict: 'symbol,market_type',
  });

  if (error) throw error;
}

export async function upsertStopLossAck(
  assetKey: string,
  tierId: StopTierId,
  stopPrice: number,
  sellPct: number
): Promise<void> {
  const parsed = parseAssetKey(assetKey);
  const symbol = parsed.symbol;
  const market_type = parsed.market_type as MarketType;
  const supabase = createServerClient();

  const { error } = await supabase.from('asset_stop_loss_ack').upsert(
    {
      symbol,
      market_type,
      tier_id: tierId,
      stop_price: stopPrice,
      sell_pct: sellPct,
      acknowledged_at: new Date().toISOString(),
    },
    { onConflict: 'symbol,market_type,tier_id' }
  );

  if (error) throw error;
}

export async function deleteStopLossForAsset(assetKey: string): Promise<void> {
  const parsed = parseAssetKey(assetKey);
  const symbol = parsed.symbol;
  const market_type = parsed.market_type as MarketType;
  const supabase = createServerClient();

  const { error: configError } = await supabase
    .from('asset_stop_loss')
    .delete()
    .eq('symbol', symbol)
    .eq('market_type', market_type);

  if (configError) throw configError;

  const { error: ackError } = await supabase
    .from('asset_stop_loss_ack')
    .delete()
    .eq('symbol', symbol)
    .eq('market_type', market_type);

  if (ackError) throw ackError;
}

export async function deleteStopLossAck(assetKey: string, tierId: StopTierId): Promise<void> {
  const parsed = parseAssetKey(assetKey);
  const symbol = parsed.symbol;
  const market_type = parsed.market_type as MarketType;
  const supabase = createServerClient();

  const { error } = await supabase
    .from('asset_stop_loss_ack')
    .delete()
    .eq('symbol', symbol)
    .eq('market_type', market_type)
    .eq('tier_id', tierId);

  if (error) throw error;
}

export function emptyConfigRecord(): AssetStopLossConfig {
  return emptyStopConfig();
}
