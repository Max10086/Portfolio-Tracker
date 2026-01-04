declare module 'yahoo-finance2' {
  interface Quote {
    regularMarketPrice?: number;
    currency?: string;
    shortName?: string;
    longName?: string;
    symbol?: string;
    marketState?: string;
    exchange?: string;
    quoteType?: string;
    [key: string]: unknown;
  }

  interface YahooFinance {
    quote(symbol: string, queryOptions?: Record<string, unknown>): Promise<Quote>;
    search(query: string, queryOptions?: Record<string, unknown>): Promise<unknown>;
    quoteSummary(symbol: string, queryOptions?: Record<string, unknown>): Promise<unknown>;
    historical(symbol: string, queryOptions?: Record<string, unknown>): Promise<unknown[]>;
    [key: string]: unknown;
  }

  const yahooFinance: YahooFinance;

  export default yahooFinance;
}

