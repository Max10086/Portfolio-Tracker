import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/exchange-rate
 * Fetch exchange rate between two currencies
 * Query params: from (default: USD), to (default: CNY)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fromCurrency = searchParams.get('from') || 'USD';
    const toCurrency = searchParams.get('to') || 'CNY';

    if (fromCurrency === toCurrency) {
      return NextResponse.json({
        rate: 1,
        from: fromCurrency,
        to: toCurrency,
      });
    }

    const baseUrl = 'https://api.exchangerate-api.com/v4/latest';
    
    try {
      const response = await fetch(`${baseUrl}/${fromCurrency}`, {
        next: { revalidate: 3600 }, // Cache for 1 hour
      });
      
      if (!response.ok) {
        throw new Error(`Exchange rate API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.rates || !data.rates[toCurrency]) {
        throw new Error(`Exchange rate not found for ${toCurrency}`);
      }

      const rate = data.rates[toCurrency];

      return NextResponse.json({
        rate,
        from: fromCurrency,
        to: toCurrency,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[ExchangeRate] Failed to fetch rate ${fromCurrency} to ${toCurrency}:`, error);
      
      // Use fallback rates if available
      const fallbackRates: Record<string, Record<string, number>> = {
        CNY: { USD: 0.137, HKD: 1.07 },
        HKD: { USD: 0.128, CNY: 0.93 },
        USD: { CNY: 7.3, HKD: 7.8 },
      };
      
      const fallbackRate = fallbackRates[fromCurrency]?.[toCurrency];
      if (fallbackRate) {
        console.log(`[ExchangeRate] Using fallback rate for ${fromCurrency} to ${toCurrency}: ${fallbackRate}`);
        return NextResponse.json({
          rate: fallbackRate,
          from: fromCurrency,
          to: toCurrency,
          timestamp: new Date().toISOString(),
          fallback: true,
        });
      }
      
      return NextResponse.json(
        { 
          error: 'Failed to fetch exchange rate',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Unexpected error in exchange-rate endpoint:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
