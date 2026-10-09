import type { MarketType } from '@/lib/price-service';

export const GATEKEEPER_OPEN_TRADE_EVENT = 'portfolio-gatekeeper-open-trade';

export interface GatekeeperTradePrefill {
  marketType: MarketType;
  symbol: string;
  transactionType: 'BUY' | 'SELL';
  quantity?: string;
  pricePerUnit?: string;
}

const PREFILL_KEY = 'portfolio-gatekeeper-trade-prefill-v1';

export function stashGatekeeperTradePrefill(prefill: GatekeeperTradePrefill): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(PREFILL_KEY, JSON.stringify(prefill));
  window.dispatchEvent(new CustomEvent(GATEKEEPER_OPEN_TRADE_EVENT));
}

export function readGatekeeperTradePrefill(): GatekeeperTradePrefill | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GatekeeperTradePrefill;
  } catch {
    return null;
  }
}

export function clearGatekeeperTradePrefill(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(PREFILL_KEY);
}
