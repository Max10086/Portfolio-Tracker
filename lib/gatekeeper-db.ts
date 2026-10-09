import { createServerClient } from '@/lib/supabase';
import { normalizeAssetNameKey } from '@/lib/asset-name-cache';
import type { GatekeeperDirection } from '@/lib/gatekeeper-checklist';

type MarketType = 'US' | 'CN' | 'HK' | 'CRYPTO' | 'CASH';

export interface GatekeeperSessionRow {
  id: string;
  symbol: string;
  market_type: MarketType;
  direction: GatekeeperDirection;
  checklist_version: string;
  answers: Record<string, unknown>;
  calculator: Record<string, unknown> | null;
  passed: boolean;
  saved_without_order: boolean;
  created_at: string;
}

function isMissingTableError(message: string): boolean {
  return (
    message.includes('gatekeeper_sessions') &&
    (message.includes('does not exist') || message.includes('schema cache'))
  );
}

export async function insertGatekeeperSession(input: {
  symbol: string;
  marketType: string;
  direction: GatekeeperDirection;
  checklistVersion: string;
  answers: Record<string, unknown>;
  calculator: Record<string, unknown> | null;
  passed: boolean;
  savedWithoutOrder: boolean;
}): Promise<{ id: string; tableReady: boolean }> {
  const symbol = input.symbol.trim().toUpperCase();
  const market_type = input.marketType.trim().toUpperCase() as MarketType;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('gatekeeper_sessions')
    .insert({
      symbol,
      market_type,
      direction: input.direction,
      checklist_version: input.checklistVersion,
      answers: input.answers,
      calculator: input.calculator,
      passed: input.passed,
      saved_without_order: input.savedWithoutOrder,
    })
    .select('id')
    .single();

  if (error) {
    if (isMissingTableError(error.message)) {
      return { id: '', tableReady: false };
    }
    throw error;
  }

  return { id: String(data?.id || ''), tableReady: true };
}

export async function fetchGatekeeperSessions(query: {
  symbol?: string;
  marketType?: string;
  limit?: number;
}): Promise<{ sessions: GatekeeperSessionRow[]; tableReady: boolean }> {
  try {
    const supabase = createServerClient();
    let q = supabase
      .from('gatekeeper_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(query.limit ?? 50);

    if (query.symbol && query.marketType) {
      q = q
        .eq('symbol', query.symbol.trim().toUpperCase())
        .eq('market_type', query.marketType.trim().toUpperCase());
    }

    const { data, error } = await q;

    if (error) {
      if (isMissingTableError(error.message)) {
        return { sessions: [], tableReady: false };
      }
      throw error;
    }

    const sessions = (data || []).map((row) => ({
      id: String(row.id),
      symbol: String(row.symbol),
      market_type: row.market_type as MarketType,
      direction: row.direction as GatekeeperDirection,
      checklist_version: String(row.checklist_version),
      answers: (row.answers as Record<string, unknown>) || {},
      calculator: (row.calculator as Record<string, unknown>) || null,
      passed: Boolean(row.passed),
      saved_without_order: Boolean(row.saved_without_order),
      created_at: String(row.created_at),
    }));

    return { sessions, tableReady: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isMissingTableError(message)) {
      return { sessions: [], tableReady: false };
    }
    throw err;
  }
}

export function assetKeyFromParts(symbol: string, marketType: string): string {
  return normalizeAssetNameKey(symbol, marketType);
}
