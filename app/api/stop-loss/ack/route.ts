import { NextRequest, NextResponse } from 'next/server';
import type { StopTierId } from '@/components/position-optimization/types';
import { normalizeAssetNameKey } from '@/lib/asset-name-cache';
import { deleteStopLossAck, upsertStopLossAck } from '@/lib/stop-loss-db';

export const dynamic = 'force-dynamic';

const VALID_TIERS: StopTierId[] = ['relief', 'retreat', 'bailout'];

/**
 * POST /api/stop-loss/ack — acknowledge a triggered tier
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const symbol = String(body?.symbol || '').trim();
    const marketType = String(body?.market_type || '').trim().toUpperCase();
    const tierId = String(body?.tier_id || '') as StopTierId;
    const stopPrice = Number(body?.stop_price);
    const sellPct = Number(body?.sell_pct);

    if (!symbol || !marketType || !VALID_TIERS.includes(tierId)) {
      return NextResponse.json({ error: 'Invalid symbol, market_type, or tier_id' }, { status: 400 });
    }
    if (!Number.isFinite(stopPrice) || !Number.isFinite(sellPct)) {
      return NextResponse.json({ error: 'stop_price and sell_pct must be numbers' }, { status: 400 });
    }

    const assetKey = normalizeAssetNameKey(symbol, marketType);
    await upsertStopLossAck(assetKey, tierId, stopPrice, sellPct);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[stop-loss/ack] POST failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to save acknowledgement',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/stop-loss/ack — clear ack when price recovers (or manual reset)
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const symbol = String(body?.symbol || '').trim();
    const marketType = String(body?.market_type || '').trim().toUpperCase();
    const tierId = String(body?.tier_id || '') as StopTierId;

    if (!symbol || !marketType || !VALID_TIERS.includes(tierId)) {
      return NextResponse.json({ error: 'Invalid symbol, market_type, or tier_id' }, { status: 400 });
    }

    const assetKey = normalizeAssetNameKey(symbol, marketType);
    await deleteStopLossAck(assetKey, tierId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[stop-loss/ack] DELETE failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to clear acknowledgement',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
