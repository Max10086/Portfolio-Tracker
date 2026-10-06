import { NextRequest, NextResponse } from 'next/server';
import { resolveDisplayNamesWithCache } from '@/lib/asset-display-names-server';
import type { MarketType } from '@/lib/price-service';

export const dynamic = 'force-dynamic';

const VALID_MARKETS: MarketType[] = ['US', 'CN', 'HK', 'CRYPTO', 'CASH'];

/**
 * POST /api/asset-names
 * Resolve display names: Supabase cache first, then market APIs for missing pairs only.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const raw = body?.assets;

    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({ names: {} });
    }

    const assets: Array<{ symbol: string; market_type: MarketType }> = [];
    const seen = new Set<string>();
    for (const item of raw) {
      if (!item?.symbol || !item?.market_type) continue;
      const marketType = String(item.market_type).toUpperCase();
      if (!VALID_MARKETS.includes(marketType as MarketType)) continue;
      const symbol = String(item.symbol).trim().toUpperCase();
      const dedupe = `${symbol}:${marketType}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      assets.push({
        symbol,
        market_type: marketType as MarketType,
      });
    }

    if (assets.length === 0) {
      return NextResponse.json({ names: {} });
    }

    const names = await resolveDisplayNamesWithCache(assets);
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
