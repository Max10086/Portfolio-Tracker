import { NextRequest, NextResponse } from 'next/server';
import { resolveAssetDisplayNames, type MarketType } from '@/lib/price-service';

export const dynamic = 'force-dynamic';

const VALID_MARKETS: MarketType[] = ['US', 'CN', 'HK', 'CRYPTO', 'CASH'];

/**
 * POST /api/asset-names
 * Resolve human-readable names for symbol + market pairs (same sources as Portfolio).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const raw = body?.assets;

    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({ names: {} });
    }

    const assets: Array<{ symbol: string; market_type: MarketType }> = [];
    for (const item of raw) {
      if (!item?.symbol || !item?.market_type) continue;
      const marketType = String(item.market_type).toUpperCase();
      if (!VALID_MARKETS.includes(marketType as MarketType)) continue;
      assets.push({
        symbol: String(item.symbol).trim().toUpperCase(),
        market_type: marketType as MarketType,
      });
    }

    if (assets.length === 0) {
      return NextResponse.json({ names: {} });
    }

    const names = await resolveAssetDisplayNames(assets);
    return NextResponse.json({ names });
  } catch (error) {
    console.error('Error resolving asset names:', error);
    return NextResponse.json(
      {
        error: 'Failed to resolve asset names',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
