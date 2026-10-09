import { NextRequest, NextResponse } from 'next/server';
import type { GatekeeperDirection } from '@/lib/gatekeeper-checklist';
import { fetchGatekeeperSessions, insertGatekeeperSession } from '@/lib/gatekeeper-db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/gatekeeper?symbol=&market_type=&limit=
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const symbol = searchParams.get('symbol') || undefined;
    const marketType = searchParams.get('market_type') || undefined;
    const limitRaw = searchParams.get('limit');
    const limit = limitRaw ? Number(limitRaw) : 50;

    const payload = await fetchGatekeeperSessions({
      symbol,
      marketType,
      limit: Number.isFinite(limit) ? limit : 50,
    });

    return NextResponse.json({
      sessions: payload.sessions,
      tableReady: payload.tableReady,
    });
  } catch (error) {
    console.error('[gatekeeper] GET failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to load gatekeeper sessions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/gatekeeper — persist one checklist session
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const symbol = String(body?.symbol || '').trim();
    const marketType = String(body?.market_type || '').trim().toUpperCase();
    const direction = String(body?.direction || '').trim().toUpperCase() as GatekeeperDirection;
    const checklistVersion = String(body?.checklist_version || '').trim();
    const answers = body?.answers as Record<string, unknown> | undefined;
    const calculator = (body?.calculator as Record<string, unknown> | null) ?? null;
    const passed = Boolean(body?.passed);
    const savedWithoutOrder = Boolean(body?.saved_without_order);

    if (!symbol || !marketType || (direction !== 'BUY' && direction !== 'SELL') || !checklistVersion || !answers) {
      return NextResponse.json(
        { error: 'symbol, market_type, direction, checklist_version, and answers are required' },
        { status: 400 }
      );
    }

    const result = await insertGatekeeperSession({
      symbol,
      marketType,
      direction,
      checklistVersion,
      answers,
      calculator,
      passed,
      savedWithoutOrder,
    });

    return NextResponse.json({
      ok: true,
      id: result.id,
      tableReady: result.tableReady,
    });
  } catch (error) {
    console.error('[gatekeeper] POST failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('schema cache') || message.includes('does not exist') ? 503 : 500;
    return NextResponse.json(
      {
        error: 'Failed to save gatekeeper session',
        details: message,
      },
      { status }
    );
  }
}
