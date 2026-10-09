import { NextRequest, NextResponse } from 'next/server';
import type { AssetStopLossConfig } from '@/components/position-optimization/types';
import { normalizeAssetNameKey } from '@/lib/asset-name-cache';
import {
  deleteStopLossForAsset,
  fetchAllStopLossFromDb,
  upsertStopLossConfig,
} from '@/lib/stop-loss-db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stop-loss — all saved thresholds and acknowledgements
 */
export async function GET() {
  try {
    const payload = await fetchAllStopLossFromDb();
    return NextResponse.json({
      configs: payload.configs,
      acks: payload.acks,
      tableReady: payload.tableReady,
    });
  } catch (error) {
    console.error('[stop-loss] GET failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to load stop-loss settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/stop-loss — upsert one asset's three-tier config
 * Body: { symbol, market_type, config: AssetStopLossConfig }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const symbol = String(body?.symbol || '').trim();
    const marketType = String(body?.market_type || '').trim().toUpperCase();
    const config = body?.config as AssetStopLossConfig | undefined;

    if (!symbol || !marketType || !config) {
      return NextResponse.json({ error: 'symbol, market_type, and config are required' }, { status: 400 });
    }

    const assetKey = normalizeAssetNameKey(symbol, marketType);
    await upsertStopLossConfig(assetKey, config);

    return NextResponse.json({ ok: true, assetKey });
  } catch (error) {
    console.error('[stop-loss] PUT failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('schema cache') || message.includes('does not exist') ? 503 : 500;
    return NextResponse.json(
      {
        error: 'Failed to save stop-loss settings',
        details: message,
      },
      { status }
    );
  }
}

/**
 * DELETE /api/stop-loss — remove all tiers and acknowledgements for one asset
 * Body: { symbol, market_type }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const symbol = String(body?.symbol || '').trim();
    const marketType = String(body?.market_type || '').trim().toUpperCase();

    if (!symbol || !marketType) {
      return NextResponse.json({ error: 'symbol and market_type are required' }, { status: 400 });
    }

    const assetKey = normalizeAssetNameKey(symbol, marketType);
    await deleteStopLossForAsset(assetKey);

    return NextResponse.json({ ok: true, assetKey });
  } catch (error) {
    console.error('[stop-loss] DELETE failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('schema cache') || message.includes('does not exist') ? 503 : 500;
    return NextResponse.json(
      {
        error: 'Failed to delete stop-loss settings',
        details: message,
      },
      { status }
    );
  }
}
