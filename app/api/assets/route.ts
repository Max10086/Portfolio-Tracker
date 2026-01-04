import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { calculatePortfolioTotal, type Asset } from '@/lib/price-service';


/**
 * GET /api/assets
 * Fetch all assets with their current prices
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // Fetch all assets
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, symbol, market_type, quantity, created_at')
      .order('created_at', { ascending: false });

    if (assetsError) {
      console.error('Error fetching assets:', assetsError);
      return NextResponse.json(
        { error: 'Failed to fetch assets', details: assetsError.message },
        { status: 500 }
      );
    }

    if (!assets || assets.length === 0) {
      return NextResponse.json({ assets: [], assetDetails: [] });
    }

    // Calculate current prices for all assets
    const baseCurrency = process.env.BASE_CURRENCY || 'USD';
    let calculationResult;
    
    try {
      calculationResult = await calculatePortfolioTotal({
        assets: assets as Asset[],
        baseCurrency,
      });
    } catch (calculationError) {
      console.error('Error calculating prices:', calculationError);
      const errorMessage = calculationError instanceof Error ? calculationError.message : 'Unknown error';
      // Return assets without prices if calculation fails, but include error details
      return NextResponse.json({
        assets,
        assetDetails: [],
        error: 'Failed to fetch prices',
        details: errorMessage,
      });
    }

    return NextResponse.json({
      assets,
      assetDetails: calculationResult.assetDetails,
      totalValue: calculationResult.totalValue,
      baseCurrency: calculationResult.baseCurrency,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/assets
 * Add a new asset
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, market_type, quantity } = body;

    // Validation
    if (!symbol || !market_type || !quantity) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, market_type, quantity' },
        { status: 400 }
      );
    }

    if (quantity <= 0) {
      return NextResponse.json(
        { error: 'Quantity must be greater than 0' },
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

    const supabase = createServerClient();

    // Insert new asset
    const { data, error } = await supabase
      .from('assets')
      .insert({
        symbol: symbol.trim().toUpperCase(),
        market_type,
        quantity: parseFloat(quantity),
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting asset:', error);
      return NextResponse.json(
        { error: 'Failed to add asset', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ asset: data }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

