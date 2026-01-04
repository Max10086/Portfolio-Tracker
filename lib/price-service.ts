import iconv from 'iconv-lite';
import yahooFinance from 'yahoo-finance2';

// Types
export type MarketType = 'US' | 'CN' | 'HK' | 'CRYPTO';

export interface Asset {
  id: string;
  symbol: string;
  market_type: MarketType;
  quantity: number;
}

export interface PriceResult {
  price: number;
  currency: string;
  symbol: string;
  name?: string; // Company name
}

// Price Cache - stores prices to avoid hitting rate limits
interface CachedPrice {
  result: PriceResult;
  timestamp: number;
}

class PriceCache {
  private cache: Map<string, CachedPrice> = new Map();
  private readonly TTL = 10 * 60 * 1000; // 10 minutes cache for better rate limiting

  get(symbol: string): PriceResult | null {
    const cached = this.cache.get(symbol.toUpperCase());
    if (cached && Date.now() - cached.timestamp < this.TTL) {
      console.log(`[PriceCache] Cache hit for ${symbol}`);
      return cached.result;
    }
    return null;
  }

  set(symbol: string, result: PriceResult): void {
    this.cache.set(symbol.toUpperCase(), {
      result,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

// Global price cache
const priceCache = new PriceCache();

// Utility: delay function
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Abstract PriceFetcher interface
export interface PriceFetcher {
  fetchPrice(symbol: string): Promise<PriceResult>;
  supportsMarket(marketType: MarketType): boolean;
}

// US Stock Fetcher using Tencent Finance API as primary (free, no API key, no rate limits)
// Falls back to Yahoo Finance if Tencent fails
class USStockFetcherImpl {
  // Primary: Use Tencent Finance API for US stocks (free, no API key required, no rate limits)
  async fetchFromTencentUSStock(symbol: string): Promise<PriceResult> {
    // Check cache first
    const cacheKey = `US:${symbol}`;
    const cached = priceCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const url = `http://qt.gtimg.cn/q=us${symbol}`;
    
    try {
      console.log(`[USStockFetcher] Fetching ${symbol} from Tencent Finance API...`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Tencent Finance API returned ${response.status}`);
      }
      
      // Tencent Finance API returns GBK encoded text
      const buffer = await response.arrayBuffer();
      const text = iconv.decode(Buffer.from(buffer), 'gbk');
      
      // Parse the response
      // Format: v_usAAPL="200~APPLE~AAPL~143.59~..."
      const match = text.match(/="([^"]+)"/);
      if (!match) {
        throw new Error(`No data found for ${symbol}`);
      }
      
      const fields = match[1].split('~');
      if (fields.length < 5 || !fields[3]) {
        throw new Error(`Invalid data format for ${symbol}`);
      }
      
      const name = fields[1];
      const price = parseFloat(fields[3]);
      
      if (isNaN(price) || price === 0) {
        throw new Error(`No price found for ${symbol}`);
      }
      
      const result: PriceResult = {
        symbol: symbol,
        name: name,
        price: price,
        currency: 'USD',
      };
      
      priceCache.set(cacheKey, result);
      console.log(`[USStockFetcher] Successfully fetched ${symbol} (${name}): USD ${price}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[USStockFetcher] Tencent Finance failed for ${symbol}:`, errorMessage);
      
      // Fallback to Yahoo Finance
      console.log(`[USStockFetcher] Trying Yahoo Finance fallback for ${symbol}...`);
      return this.fetchFromYahooFinance(symbol);
    }
  }

  // Fallback: Use Yahoo Finance API
  private async fetchFromYahooFinance(symbol: string): Promise<PriceResult> {
    const cacheKey = `US:${symbol}`;
    
    try {
      // Use yahoo-finance2 package
      const quote = await yahooFinance.quote(symbol);

      if (!quote || typeof quote.regularMarketPrice !== 'number') {
        throw new Error(`No price data found for ${symbol}`);
      }

      const result: PriceResult = {
        price: quote.regularMarketPrice,
        currency: quote.currency || 'USD',
        symbol: symbol,
        name: quote.shortName || quote.longName || undefined,
      };

      priceCache.set(cacheKey, result);
      console.log(`[USStockFetcher] Yahoo Finance successfully fetched ${symbol} (${result.name}): ${result.currency} ${result.price}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[USStockFetcher] Yahoo Finance fallback failed for ${symbol}:`, errorMessage);
      throw new Error(`Failed to fetch US stock price for ${symbol}: ${errorMessage}`);
    }
  }
}

// Tencent Finance API Fetcher for CN and HK stocks (free, no API key required)
// This API provides real-time quotes for Chinese and Hong Kong markets
class TencentFinanceFetcher {
  // Parse Tencent Finance API response
  // Format: v_sh600519="1~贵州茅台~600519~1377.18~..."
  protected parseTencentResponse(responseText: string, symbol: string): PriceResult | null {
    try {
      // Extract the data between quotes
      const match = responseText.match(/="([^"]+)"/);
      if (!match) {
        return null;
      }

      const fields = match[1].split('~');
      if (fields.length < 5 || !fields[3]) {
        return null;
      }

      // Fields: 0=market, 1=name, 2=code, 3=current_price, 4=yesterday_close, ...
      const name = fields[1];
      const price = parseFloat(fields[3]);

      if (isNaN(price) || price === 0) {
        return null;
      }

      return {
        symbol: symbol,
        name: name,
        price: price,
        currency: 'CNY', // Will be updated for HK stocks
      };
    } catch (error) {
      console.error('[TencentFinanceFetcher] Parse error:', error);
      return null;
    }
  }
}

// US Stock Fetcher - uses Tencent Finance API as primary, Yahoo Finance as fallback
export class USStockFetcher extends USStockFetcherImpl implements PriceFetcher {
  supportsMarket(marketType: MarketType): boolean {
    return marketType === 'US';
  }

  async fetchPrice(symbol: string): Promise<PriceResult> {
    return await this.fetchFromTencentUSStock(symbol);
  }
}

// China A-Share Stock Fetcher using Tencent Finance API
export class CNStockFetcher extends TencentFinanceFetcher implements PriceFetcher {
  supportsMarket(marketType: MarketType): boolean {
    return marketType === 'CN';
  }

  async fetchPrice(symbol: string): Promise<PriceResult> {
    // Normalize symbol - remove .SS or .SZ suffix if present
    let normalizedSymbol = symbol;
    let prefix = 'sh'; // Default to Shanghai

    if (symbol.endsWith('.SS')) {
      normalizedSymbol = symbol.replace('.SS', '');
      prefix = 'sh';
    } else if (symbol.endsWith('.SZ')) {
      normalizedSymbol = symbol.replace('.SZ', '');
      prefix = 'sz';
    } else {
      // Determine exchange by stock code
      // Shanghai: 6xxxxx, Shenzhen: 0xxxxx, 3xxxxx
      if (normalizedSymbol.startsWith('6')) {
        prefix = 'sh';
      } else if (normalizedSymbol.startsWith('0') || normalizedSymbol.startsWith('3')) {
        prefix = 'sz';
      }
    }

    // Check cache first
    const cacheKey = `CN:${prefix}${normalizedSymbol}`;
    const cached = priceCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const url = `http://qt.gtimg.cn/q=${prefix}${normalizedSymbol}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Tencent Finance API returned ${response.status}`);
      }

      // Tencent Finance API returns GBK encoded text
      const buffer = await response.arrayBuffer();
      const text = iconv.decode(Buffer.from(buffer), 'gbk');
      const result = this.parseTencentResponse(text, normalizedSymbol);

      if (!result) {
        throw new Error(`No price found for ${symbol}`);
      }

      result.currency = 'CNY';
      priceCache.set(cacheKey, result);
      console.log(`[CNStockFetcher] Successfully fetched ${symbol} (${result.name}): CNY ${result.price}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[CNStockFetcher] Failed to fetch ${symbol}:`, errorMessage);
      throw new Error(`Failed to fetch CN stock price for ${symbol}: ${errorMessage}`);
    }
  }
}

// Hong Kong Stock Fetcher using Tencent Finance API
export class HKStockFetcher extends TencentFinanceFetcher implements PriceFetcher {
  supportsMarket(marketType: MarketType): boolean {
    return marketType === 'HK';
  }

  async fetchPrice(symbol: string): Promise<PriceResult> {
    // Normalize symbol - remove .HK suffix if present
    let normalizedSymbol = symbol;
    if (symbol.endsWith('.HK')) {
      normalizedSymbol = symbol.replace('.HK', '');
    }

    // Pad to 5 digits for HK stocks (e.g., 700 -> 00700)
    normalizedSymbol = normalizedSymbol.padStart(5, '0');

    // Check cache first
    const cacheKey = `HK:hk${normalizedSymbol}`;
    const cached = priceCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const url = `http://qt.gtimg.cn/q=hk${normalizedSymbol}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Tencent Finance API returned ${response.status}`);
      }

      // Tencent Finance API returns GBK encoded text
      const buffer = await response.arrayBuffer();
      const text = iconv.decode(Buffer.from(buffer), 'gbk');
      const result = this.parseTencentResponse(text, normalizedSymbol);

      if (!result) {
        throw new Error(`No price found for ${symbol}`);
      }

      result.currency = 'HKD';
      priceCache.set(cacheKey, result);
      console.log(`[HKStockFetcher] Successfully fetched ${symbol} (${result.name}): HKD ${result.price}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[HKStockFetcher] Failed to fetch ${symbol}:`, errorMessage);
      throw new Error(`Failed to fetch HK stock price for ${symbol}: ${errorMessage}`);
    }
  }
}

// Crypto Fetcher using CoinGecko API (free, no API key required)
export class CryptoFetcher implements PriceFetcher {
  private readonly baseUrl = 'https://api.coingecko.com/api/v3';
  
  supportsMarket(marketType: MarketType): boolean {
    return marketType === 'CRYPTO';
  }

  async fetchPrice(symbol: string): Promise<PriceResult> {
    // Check cache first
    const cacheKey = `CRYPTO:${symbol}`;
    const cached = priceCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const coinId = this.mapSymbolToCoinGeckoId(symbol.toLowerCase());
      
      const response = await fetch(
        `${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=usd`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data[coinId] || !data[coinId].usd) {
        throw new Error(`No price data found for ${symbol}`);
      }

      // Get full name from coins list
      const name = this.getCryptoName(symbol.toLowerCase());

      const result: PriceResult = {
        price: data[coinId].usd,
        currency: 'USD',
        symbol: symbol.toUpperCase(),
        name: name,
      };

      priceCache.set(cacheKey, result);
      console.log(`[CryptoFetcher] Successfully fetched ${symbol} (${name}): $${result.price}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[CryptoFetcher] Failed to fetch ${symbol}:`, errorMessage);
      throw new Error(`Failed to fetch crypto price for ${symbol}: ${errorMessage}`);
    }
  }

  private mapSymbolToCoinGeckoId(symbol: string): string {
    const symbolMap: Record<string, string> = {
      'btc': 'bitcoin',
      'eth': 'ethereum',
      'bnb': 'binancecoin',
      'sol': 'solana',
      'ada': 'cardano',
      'xrp': 'ripple',
      'dot': 'polkadot',
      'doge': 'dogecoin',
      'matic': 'matic-network',
      'avax': 'avalanche-2',
      'link': 'chainlink',
      'ltc': 'litecoin',
      'atom': 'cosmos',
      'etc': 'ethereum-classic',
      'xlm': 'stellar',
      'algo': 'algorand',
      'vet': 'vechain',
      'icp': 'internet-computer',
      'fil': 'filecoin',
    };

    return symbolMap[symbol] || symbol;
  }

  private getCryptoName(symbol: string): string {
    const nameMap: Record<string, string> = {
      'btc': 'Bitcoin',
      'eth': 'Ethereum',
      'bnb': 'BNB',
      'sol': 'Solana',
      'ada': 'Cardano',
      'xrp': 'XRP',
      'dot': 'Polkadot',
      'doge': 'Dogecoin',
      'matic': 'Polygon',
      'avax': 'Avalanche',
      'link': 'Chainlink',
      'ltc': 'Litecoin',
      'atom': 'Cosmos',
      'etc': 'Ethereum Classic',
      'xlm': 'Stellar',
      'algo': 'Algorand',
      'vet': 'VeChain',
      'icp': 'Internet Computer',
      'fil': 'Filecoin',
    };

    return nameMap[symbol] || symbol.toUpperCase();
  }
}

// Currency Converter
export class CurrencyConverter {
  private readonly baseUrl = 'https://api.exchangerate-api.com/v4/latest';
  private cache: Map<string, { rate: number; timestamp: number }> = new Map();
  private readonly cacheTTL = 60 * 60 * 1000; // 1 hour cache

  // Fallback exchange rates (approximate) for when API fails
  private readonly fallbackRates: Record<string, Record<string, number>> = {
    CNY: { USD: 0.137, HKD: 1.07 },
    HKD: { USD: 0.128, CNY: 0.93 },
    USD: { CNY: 7.3, HKD: 7.8 },
  };

  async convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<number> {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    const rate = await this.getExchangeRate(fromCurrency, toCurrency);
    const result = amount * rate;
    console.log(`[CurrencyConverter] Converting ${amount} ${fromCurrency} to ${toCurrency}: rate=${rate}, result=${result}`);
    return result;
  }

  async getExchangeRate(
    fromCurrency: string,
    toCurrency: string
  ): Promise<number> {
    const cacheKey = `${fromCurrency}_${toCurrency}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log(`[CurrencyConverter] Cache hit for ${fromCurrency} to ${toCurrency}: ${cached.rate}`);
      return cached.rate;
    }

    try {
      console.log(`[CurrencyConverter] Fetching exchange rate from ${fromCurrency} to ${toCurrency}...`);
      const response = await fetch(`${this.baseUrl}/${fromCurrency}`);
      
      if (!response.ok) {
        throw new Error(`Exchange rate API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.rates || !data.rates[toCurrency]) {
        throw new Error(`Exchange rate not found for ${toCurrency}`);
      }

      const rate = data.rates[toCurrency];
      console.log(`[CurrencyConverter] Exchange rate ${fromCurrency} to ${toCurrency}: ${rate}`);

      this.cache.set(cacheKey, {
        rate,
        timestamp: Date.now(),
      });

      return rate;
    } catch (error) {
      console.error(`[CurrencyConverter] Failed to fetch exchange rate ${fromCurrency} to ${toCurrency}:`, error);
      
      // Use fallback rates if available
      const fallbackRate = this.fallbackRates[fromCurrency]?.[toCurrency];
      if (fallbackRate) {
        console.log(`[CurrencyConverter] Using fallback rate for ${fromCurrency} to ${toCurrency}: ${fallbackRate}`);
        this.cache.set(cacheKey, {
          rate: fallbackRate,
          timestamp: Date.now(),
        });
        return fallbackRate;
      }
      
      // If no fallback available, throw error instead of returning 1
      throw new Error(`Cannot convert ${fromCurrency} to ${toCurrency}: no exchange rate available`);
    }
  }
}

// Price Fetcher Factory
class PriceFetcherFactory {
  private fetchers: PriceFetcher[] = [];

  constructor() {
    this.fetchers = [
      new USStockFetcher(),
      new CNStockFetcher(),
      new HKStockFetcher(),
      new CryptoFetcher(),
    ];
  }

  getFetcher(marketType: MarketType): PriceFetcher {
    const fetcher = this.fetchers.find((f) => f.supportsMarket(marketType));
    if (!fetcher) {
      throw new Error(`No fetcher found for market type: ${marketType}`);
    }
    return fetcher;
  }
}

// Main function to calculate portfolio total
export interface CalculatePortfolioTotalOptions {
  baseCurrency?: string;
  assets: Asset[];
}

export interface PortfolioCalculationResult {
  totalValue: number;
  baseCurrency: string;
  assetDetails: Array<{
    asset: Asset;
    price: number;
    value: number;
    currency: string;
    name?: string;
  }>;
}

export async function calculatePortfolioTotal(
  options: CalculatePortfolioTotalOptions
): Promise<PortfolioCalculationResult> {
  const { assets, baseCurrency = 'USD' } = options;
  const factory = new PriceFetcherFactory();
  const converter = new CurrencyConverter();

  const assetDetails: PortfolioCalculationResult['assetDetails'] = [];
  let totalValue = 0;

  // Process assets sequentially with delay to avoid rate limiting
  for (const asset of assets) {
    try {
      const fetcher = factory.getFetcher(asset.market_type);
      const priceResult = await fetcher.fetchPrice(asset.symbol);
      
      const valueInOriginalCurrency = priceResult.price * asset.quantity;
      const valueInBaseCurrency = await converter.convert(
        valueInOriginalCurrency,
        priceResult.currency,
        baseCurrency
      );

      assetDetails.push({
        asset,
        price: priceResult.price,
        value: valueInBaseCurrency,
        currency: priceResult.currency,
        name: priceResult.name,
      });
      
      totalValue += valueInBaseCurrency;
      
      // Small delay between fetches to respect rate limits
      await delay(200);
    } catch (error) {
      console.error(`Error processing asset ${asset.symbol}:`, error);
      // Add asset with zero value for failed fetches
      assetDetails.push({
        asset,
        price: 0,
        value: 0,
        currency: baseCurrency,
      });
    }
  }

  return {
    totalValue: Math.round(totalValue * 100) / 100,
    baseCurrency,
    assetDetails,
  };
}

// Export cache clear function for testing
export function clearPriceCache(): void {
  priceCache.clear();
}
