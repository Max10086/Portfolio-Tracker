import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { calculatePortfolioTotal, type Asset } from '@/lib/price-service';

/**
 * API Route: POST /api/cron/update-nav
 * 
 * This endpoint calculates the current portfolio NAV and stores it in the database.
 * Designed to be called by Vercel Cron (or external cron job) every hour.
 * 
 * Security: Consider adding authentication/authorization header check for production
 */
export async function POST(request: NextRequest) {
  try {
    // Optional: Verify cron secret for security (recommended for production)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    // Fetch all assets from the database
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, symbol, market_type, quantity');

    if (assetsError) {
      console.error('Error fetching assets:', assetsError);
      return NextResponse.json(
        { 
          error: 'Failed to fetch assets',
          details: assetsError.message 
        },
        { status: 500 }
      );
    }

    if (!assets || assets.length === 0) {
      console.warn('No assets found in database');
      // Return success but with zero value
      const { error: insertError } = await supabase
        .from('portfolio_snapshots')
        .insert({
          total_value: 0,
          recorded_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('Error inserting zero snapshot:', insertError);
        return NextResponse.json(
          { 
            error: 'Failed to insert snapshot',
            details: insertError.message 
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'No assets found, inserted zero snapshot',
        totalValue: 0,
      });
    }

    // Calculate portfolio total
    const baseCurrency = process.env.BASE_CURRENCY || 'USD';
    
    let calculationResult;
    try {
      calculationResult = await calculatePortfolioTotal({
        assets: assets as Asset[],
        baseCurrency,
      });
    } catch (calculationError) {
      console.error('Error calculating portfolio total:', calculationError);
      return NextResponse.json(
        { 
          error: 'Failed to calculate portfolio total',
          details: calculationError instanceof Error ? calculationError.message : 'Unknown error'
        },
        { status: 500 }
      );
    }

    // Insert snapshot into database
    const { error: insertError } = await supabase
      .from('portfolio_snapshots')
      .insert({
        total_value: calculationResult.totalValue,
        recorded_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Error inserting portfolio snapshot:', insertError);
      return NextResponse.json(
        { 
          error: 'Failed to insert portfolio snapshot',
          details: insertError.message 
        },
        { status: 500 }
      );
    }

    // Return success response
    return NextResponse.json({
      success: true,
      totalValue: calculationResult.totalValue,
      baseCurrency: calculationResult.baseCurrency,
      assetCount: assets.length,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Unexpected error in update-nav endpoint:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Also support GET for manual testing (optional)
export async function GET(request: NextRequest) {
  return POST(request);
}

