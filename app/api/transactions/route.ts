import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { calculatePortfolioTotal, type Asset } from '@/lib/price-service';

export type TransactionType = 'BUY' | 'SELL';

export interface Transaction {
  id: string;
  symbol: string;
  market_type: 'US' | 'CN' | 'HK' | 'CRYPTO';
  transaction_type: TransactionType;
  quantity: number;
  price_per_unit?: number;
  transaction_date: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface HoldingSummary {
  symbol: string;
  market_type: 'US' | 'CN' | 'HK' | 'CRYPTO';
  quantity: number;
  first_transaction_date: string;
  last_transaction_date: string;
  transaction_count: number;
}

/**
 * GET /api/transactions
 * Fetch all transactions or current holdings with prices
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'holdings'; // 'holdings' or 'transactions'

    const supabase = createServerClient();

    if (view === 'transactions') {
      // Return all transactions
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .order('transaction_date', { ascending: false });

      if (error) {
        console.error('Error fetching transactions:', error);
        return NextResponse.json(
          { error: 'Failed to fetch transactions', details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ transactions: transactions || [] });
    }

    // Default: Return current holdings with prices
    const { data: holdings, error: holdingsError } = await supabase
      .from('current_holdings')
      .select('*');

    if (holdingsError) {
      // If view doesn't exist, calculate holdings from transactions table directly
      console.warn('current_holdings view not found, calculating from transactions');
      
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('symbol, market_type, transaction_type, quantity');

      if (txError) {
        console.error('Error fetching transactions:', txError);
        return NextResponse.json(
          { error: 'Failed to fetch holdings', details: txError.message },
          { status: 500 }
        );
      }

      // Calculate holdings from transactions
      const holdingsMap = new Map<string, HoldingSummary>();
      
      for (const tx of transactions || []) {
        const key = `${tx.symbol}:${tx.market_type}`;
        const existing = holdingsMap.get(key);
        const qty = tx.transaction_type === 'BUY' ? tx.quantity : -tx.quantity;
        
        if (existing) {
          existing.quantity += qty;
          existing.transaction_count++;
        } else {
          holdingsMap.set(key, {
            symbol: tx.symbol,
            market_type: tx.market_type,
            quantity: qty,
            first_transaction_date: new Date().toISOString(),
            last_transaction_date: new Date().toISOString(),
            transaction_count: 1,
          });
        }
      }

      const calculatedHoldings = Array.from(holdingsMap.values())
        .filter(h => h.quantity > 0);

      return await enrichHoldingsWithPrices(calculatedHoldings);
    }

    if (!holdings || holdings.length === 0) {
      return NextResponse.json({ assets: [], assetDetails: [], totalValue: 0 });
    }

    return await enrichHoldingsWithPrices(holdings);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}

async function enrichHoldingsWithPrices(holdings: HoldingSummary[]) {
  const baseCurrency = process.env.BASE_CURRENCY || 'USD';
  
  // Convert holdings to assets format for price calculation
  const assets: Asset[] = holdings.map((h, index) => ({
    id: `${h.symbol}-${index}`,
    symbol: h.symbol,
    market_type: h.market_type,
    quantity: Number(h.quantity),
  }));

  try {
    const calculationResult = await calculatePortfolioTotal({
      assets,
      baseCurrency,
    });

    // Merge holdings with price data
    const enrichedAssets = holdings.map((holding, index) => {
      const detail = calculationResult.assetDetails.find(
        d => d.asset.symbol === holding.symbol && d.asset.market_type === holding.market_type
      );
      return {
        id: `${holding.symbol}-${index}`,
        symbol: holding.symbol,
        market_type: holding.market_type,
        quantity: Number(holding.quantity),
        first_transaction_date: holding.first_transaction_date,
        last_transaction_date: holding.last_transaction_date,
        transaction_count: holding.transaction_count,
        price: detail?.price || 0,
        value: detail?.value || 0,
        currency: detail?.currency || baseCurrency, // Original currency for price display
        baseCurrency: baseCurrency, // Base currency for value display
        name: detail?.name,
      };
    });

    return NextResponse.json({
      assets: enrichedAssets,
      assetDetails: calculationResult.assetDetails,
      totalValue: calculationResult.totalValue,
      baseCurrency: calculationResult.baseCurrency,
    });
  } catch (error) {
    console.error('Error calculating prices:', error);
    return NextResponse.json({
      assets: holdings,
      assetDetails: [],
      error: 'Failed to fetch prices',
      details: (error as Error).message,
    });
  }
}

/**
 * POST /api/transactions
 * Add a new transaction (buy or sell)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, market_type, transaction_type, quantity, price_per_unit, transaction_date, notes } = body;

    // Validation
    if (!symbol || !market_type || !quantity) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, market_type, quantity' },
        { status: 400 }
      );
    }

    const quantityNum = parseFloat(quantity);
    if (isNaN(quantityNum) || quantityNum <= 0) {
      return NextResponse.json(
        { error: 'Quantity must be a positive number' },
        { status: 400 }
      );
    }

    const validMarketTypes = ['US', 'CN', 'HK', 'CRYPTO'];
    if (!validMarketTypes.includes(market_type)) {
      return NextResponse.json(
        { error: `Invalid market_type. Must be one of: ${validMarketTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const txType = transaction_type || 'BUY';
    if (!['BUY', 'SELL'].includes(txType)) {
      return NextResponse.json(
        { error: 'Invalid transaction_type. Must be BUY or SELL' },
        { status: 400 }
      );
    }

    // For SELL transactions, validate that user has enough holdings
    if (txType === 'SELL') {
      const supabase = createServerClient();
      const { data: holdings } = await supabase
        .from('current_holdings')
        .select('quantity')
        .eq('symbol', symbol.trim().toUpperCase())
        .eq('market_type', market_type)
        .single();

      const currentQty = holdings?.quantity || 0;
      if (currentQty < quantityNum) {
        return NextResponse.json(
          { error: `Cannot sell ${quantityNum} ${symbol}. Current holdings: ${currentQty}` },
          { status: 400 }
        );
      }
    }

    const supabase = createServerClient();

    // Insert new transaction
    const insertData: Record<string, unknown> = {
      symbol: symbol.trim().toUpperCase(),
      market_type,
      transaction_type: txType,
      quantity: quantityNum,
      transaction_date: transaction_date || new Date().toISOString().split('T')[0],
    };

    if (price_per_unit !== undefined && price_per_unit !== null && price_per_unit !== '') {
      insertData.price_per_unit = parseFloat(price_per_unit);
    }

    if (notes) {
      insertData.notes = notes;
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error inserting transaction:', error);
      return NextResponse.json(
        { error: 'Failed to add transaction', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ transaction: data }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}

