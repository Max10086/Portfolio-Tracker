import type { GatekeeperDirection } from '@/lib/gatekeeper-checklist';
import type { GatekeeperSessionRow } from '@/lib/gatekeeper-db';

export interface SaveGatekeeperSessionInput {
  symbol: string;
  market_type: string;
  direction: GatekeeperDirection;
  checklist_version: string;
  answers: Record<string, string | null>;
  calculator: Record<string, unknown> | null;
  passed: boolean;
  saved_without_order: boolean;
}

export async function saveGatekeeperSessionRemote(
  input: SaveGatekeeperSessionInput
): Promise<{ id: string; tableReady: boolean }> {
  const response = await fetch('/api/gatekeeper', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    tableReady?: boolean;
    error?: string;
    details?: string;
  };
  if (!response.ok) {
    throw new Error(
      typeof payload.details === 'string' ? payload.details : payload.error || 'Save failed'
    );
  }
  return { id: payload.id || '', tableReady: payload.tableReady !== false };
}

export async function fetchGatekeeperSessionsRemote(query: {
  symbol?: string;
  market_type?: string;
  limit?: number;
}): Promise<{ sessions: GatekeeperSessionRow[]; tableReady: boolean }> {
  const params = new URLSearchParams();
  if (query.symbol) params.set('symbol', query.symbol);
  if (query.market_type) params.set('market_type', query.market_type);
  if (query.limit) params.set('limit', String(query.limit));

  const response = await fetch(`/api/gatekeeper?${params.toString()}`, { cache: 'no-store' });
  const payload = (await response.json().catch(() => ({}))) as {
    sessions?: GatekeeperSessionRow[];
    tableReady?: boolean;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to load gatekeeper history');
  }
  return {
    sessions: payload.sessions || [],
    tableReady: payload.tableReady !== false,
  };
}
