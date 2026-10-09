import type { MarketType } from '@/lib/price-service';

export type QuoteCurrency = 'USD' | 'CNY' | 'HKD';

/** Native quote currency for stock prices and gatekeeper calculators. */
export function quoteCurrencyForMarket(marketType: string): QuoteCurrency {
  const m = marketType.trim().toUpperCase();
  if (m === 'CN') return 'CNY';
  if (m === 'HK') return 'HKD';
  return 'USD';
}

export function isQuoteCurrency(value: string): value is QuoteCurrency {
  return value === 'USD' || value === 'CNY' || value === 'HKD';
}

export function currencySymbol(currency: string): string {
  if (currency === 'USD') return '$';
  if (currency === 'CNY') return '¥';
  if (currency === 'HKD') return 'HK$';
  return `${currency} `;
}

export function formatMoneyWithSymbol(amount: number, currency: string): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${currencySymbol(currency)}${formatted}`;
}

export function defaultMarketTypeForQuote(currency: QuoteCurrency): MarketType {
  if (currency === 'CNY') return 'CN';
  if (currency === 'HKD') return 'HK';
  return 'US';
}
