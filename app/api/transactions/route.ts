import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { calculatePortfolioTotal, CurrencyConverter, type Asset } from '@/lib/price-service';



export type TransactionType = 'BUY' | 'SELL';

export interface Transaction {
  id: string;
  symbol: string;
  market_type: 'US' | 'CN' | 'HK' | 'CRYPTO' | 'CASH';
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
  market_type: 'US' | 'CN' | 'HK' | 'CRYPTO' | 'CASH';
  quantity: number;
  first_transaction_date: string;
  last_transaction_date: string;
  transaction_count: number;
  tag?: string;
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

      return await enrichHoldingsWithPrices(supabase, calculatedHoldings);
    }

    if (!holdings || holdings.length === 0) {
      return NextResponse.json({ assets: [], assetDetails: [], totalValue: 0 });
    }

    return await enrichHoldingsWithPrices(supabase, holdings);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}

async function enrichHoldingsWithPrices(
  supabase: ReturnType<typeof createServerClient>,
  holdings: HoldingSummary[]
) {
  const baseCurrency = process.env.BASE_CURRENCY || 'USD';

  // Fetch tag for each holding from most recent transaction
  const tagMap = new Map<string, string>();
  const { data: taggedTxs } = await supabase
    .from('transactions')
    .select('symbol, market_type, tag')
    .not('tag', 'is', null)
    .order('transaction_date', { ascending: false });

  for (const tx of taggedTxs || []) {
    const key = `${tx.symbol}:${tx.market_type}`;
    if (!tagMap.has(key) && tx.tag) {
      tagMap.set(key, tx.tag);
    }
  }

  const holdingsWithTag = holdings.map((h) => ({
    ...h,
    tag: tagMap.get(`${h.symbol}:${h.market_type}`),
  }));

  // Convert holdings to assets format for price calculation
  const assets: Asset[] = holdingsWithTag.map((h, index) => ({
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

    // Merge holdings with price data and tag
    const enrichedAssets = holdingsWithTag.map((holding, index) => {
      const detail = calculationResult.assetDetails.find(
        (d) => d.asset.symbol === holding.symbol && d.asset.market_type === holding.market_type
      );
      return {
        id: `${holding.symbol}-${index}`,
        symbol: holding.symbol,
        market_type: holding.market_type,
        quantity: Number(holding.quantity),
        first_transaction_date: holding.first_transaction_date,
        last_transaction_date: holding.last_transaction_date,
        transaction_count: holding.transaction_count,
        tag: holding.tag,
        price: detail?.price || 0,
        value: detail?.value || 0,
        currency: detail?.currency || baseCurrency,
        baseCurrency: baseCurrency,
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
 * Get transaction value (price * quantity) for non-cash assets.
 * Uses price_per_unit if provided, otherwise fetches current price.
 */
async function getTransactionValue(
  symbol: string,
  marketType: string,
  quantity: number,
  pricePerUnit?: number
): Promise<{ value: number; currency: string }> {
  if (pricePerUnit !== undefined && pricePerUnit !== null && !isNaN(parseFloat(String(pricePerUnit)))) {
    const price = parseFloat(String(pricePerUnit));
    const currency = marketType === 'US' || marketType === 'CRYPTO' ? 'USD' : marketType === 'CN' ? 'CNY' : 'HKD';
    return { value: price * quantity, currency };
  }
  const assets: Asset[] = [{
    id: 'temp',
    symbol: symbol.trim().toUpperCase(),
    market_type: marketType as Asset['market_type'],
    quantity: 1,
  }];
  const result = await calculatePortfolioTotal({ assets, baseCurrency: 'USD' });
  const detail = result.assetDetails[0];
  if (!detail) {
    throw new Error(`Could not fetch price for ${symbol}`);
  }
  const price = detail.price;
  const currency = detail.currency;
  return { value: price * quantity, currency };
}

/**
 * POST /api/transactions
 * Add a new transaction (buy or sell)
 * Supports optional cash reconciliation: when update_cash_balance=true, automatically
 * adjusts the selected Cash asset (BUY stock => decrement cash, SELL stock => increment cash).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      symbol,
      market_type,
      transaction_type,
      quantity,
      price_per_unit,
      transaction_date,
      notes,
      tag,
      update_cash_balance = true,
      cash_asset_symbol,
    } = body;

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

    const validMarketTypes = ['US', 'CN', 'HK', 'CRYPTO', 'CASH'];
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

    const supabase = createServerClient();

    // For SELL transactions, validate that user has enough holdings of the asset being sold
    if (txType === 'SELL') {
      const { data: holdings } = await supabase
        .from('current_holdings')
        .select('quantity')
        .eq('symbol', symbol.trim().toUpperCase())
        .eq('market_type', market_type)
        .maybeSingle();

      const currentQty = Number(holdings?.quantity ?? 0);
      if (currentQty < quantityNum) {
        return NextResponse.json(
          { error: `Cannot sell ${quantityNum} ${symbol}. Current holdings: ${currentQty}` },
          { status: 400 }
        );
      }
    }

    // Cash reconciliation: only for non-CASH assets when update_cash_balance is true
    const shouldUpdateCash = update_cash_balance && market_type !== 'CASH' && cash_asset_symbol;
    let transactionValue = 0;
    let transactionCurrency = 'USD';
    let cashReconciliationValue = 0;

    if (shouldUpdateCash) {
      const validCashSymbols = ['USD', 'CNY', 'HKD'];
      const cashSymbol = String(cash_asset_symbol).trim().toUpperCase();
      if (!validCashSymbols.includes(cashSymbol)) {
        return NextResponse.json(
          { error: 'Invalid cash_asset_symbol. Must be USD, CNY, or HKD' },
          { status: 400 }
        );
      }

      try {
        const tv = await getTransactionValue(symbol, market_type, quantityNum, price_per_unit);
        transactionValue = tv.value;
        transactionCurrency = tv.currency;
      } catch (err) {
        return NextResponse.json(
          { error: 'Could not determine transaction value. Please provide price per unit or ensure the asset symbol is valid.' },
          { status: 400 }
        );
      }

      cashReconciliationValue = transactionValue;
      if (transactionCurrency !== cashSymbol) {
        try {
          const converter = new CurrencyConverter();
          cashReconciliationValue = await converter.convert(
            transactionValue,
            transactionCurrency,
            cashSymbol
          );
        } catch (conversionError) {
          return NextResponse.json(
            {
              error: `Failed to convert ${transactionCurrency} to ${cashSymbol} for cash reconciliation.`,
              details: conversionError instanceof Error ? conversionError.message : 'Unknown conversion error',
            },
            { status: 400 }
          );
        }
      }

      // For BUY: validate sufficient cash balance
      if (txType === 'BUY') {
        const { data: cashHolding } = await supabase
          .from('current_holdings')
          .select('quantity')
          .eq('symbol', cashSymbol)
          .eq('market_type', 'CASH')
          .maybeSingle();

        const cashBalance = Number(cashHolding?.quantity ?? 0);
        if (cashBalance < cashReconciliationValue) {
          return NextResponse.json(
            {
              error: `Insufficient ${cashSymbol} balance. Required: ${cashReconciliationValue.toFixed(2)}, Available: ${cashBalance.toFixed(2)}`,
            },
            { status: 400 }
          );
        }
      }
    }

    const txDate = transaction_date || new Date().toISOString().split('T')[0];
    const pricePerUnitNum = price_per_unit !== undefined && price_per_unit !== null && price_per_unit !== ''
      ? parseFloat(price_per_unit)
      : null;

    // Use atomic RPC when cash reconciliation is enabled
    if (shouldUpdateCash) {
      const { data: txId, error: rpcError } = await supabase.rpc('execute_transaction_with_cash_update', {
        p_symbol: symbol.trim().toUpperCase(),
        p_market_type: market_type,
        p_transaction_type: txType,
        p_quantity: quantityNum,
        p_price_per_unit: pricePerUnitNum,
        p_transaction_date: txDate,
        p_notes: notes || null,
        p_cash_symbol: String(cash_asset_symbol).trim().toUpperCase(),
        p_cash_quantity: cashReconciliationValue,
      });

      if (rpcError) {
        console.error('Error in execute_transaction_with_cash_update:', rpcError);
        return NextResponse.json(
          { error: 'Failed to add transaction', details: rpcError.message },
          { status: 500 }
        );
      }

      if (tag && String(tag).trim()) {
        await supabase
          .from('transactions')
          .update({ tag: String(tag).trim() })
          .eq('id', txId);
      }

      const { data: transaction, error: fetchError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', txId)
        .single();

      if (fetchError || !transaction) {
        return NextResponse.json(
          { error: 'Transaction created but failed to fetch', details: fetchError?.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ transaction }, { status: 201 });
    }

    // Standard insert (no cash update)
    const insertData: Record<string, unknown> = {
      symbol: symbol.trim().toUpperCase(),
      market_type,
      transaction_type: txType,
      quantity: quantityNum,
      transaction_date: txDate,
    };

    if (pricePerUnitNum !== null) {
      insertData.price_per_unit = pricePerUnitNum;
    }
    if (notes) {
      insertData.notes = notes;
    }
    if (tag && String(tag).trim()) {
      insertData.tag = String(tag).trim();
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

