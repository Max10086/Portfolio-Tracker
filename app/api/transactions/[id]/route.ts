import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'edge';

/**
 * GET /api/transactions/[id]
 * Fetch a single transaction by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    const { data: transaction, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Transaction not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching transaction:', error);
      return NextResponse.json(
        { error: 'Failed to fetch transaction', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ transaction });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/transactions/[id]
 * Update a transaction
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { symbol, market_type, transaction_type, quantity, price_per_unit, transaction_date, notes } = body;

    const supabase = createServerClient();

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};

    if (symbol !== undefined) {
      updateData.symbol = symbol.trim().toUpperCase();
    }

    if (market_type !== undefined) {
      const validMarketTypes = ['US', 'CN', 'HK', 'CRYPTO', 'CASH'];
      if (!validMarketTypes.includes(market_type)) {
        return NextResponse.json(
          { error: `Invalid market_type. Must be one of: ${validMarketTypes.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.market_type = market_type;
    }

    if (transaction_type !== undefined) {
      if (!['BUY', 'SELL'].includes(transaction_type)) {
        return NextResponse.json(
          { error: 'Invalid transaction_type. Must be BUY or SELL' },
          { status: 400 }
        );
      }
      updateData.transaction_type = transaction_type;
    }

    if (quantity !== undefined) {
      const quantityNum = parseFloat(quantity);
      if (isNaN(quantityNum) || quantityNum <= 0) {
        return NextResponse.json(
          { error: 'Quantity must be a positive number' },
          { status: 400 }
        );
      }
      updateData.quantity = quantityNum;
    }

    if (price_per_unit !== undefined) {
      if (price_per_unit === null || price_per_unit === '') {
        updateData.price_per_unit = null;
      } else {
        updateData.price_per_unit = parseFloat(price_per_unit);
      }
    }

    if (transaction_date !== undefined) {
      updateData.transaction_date = transaction_date;
    }

    if (notes !== undefined) {
      updateData.notes = notes || null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Transaction not found' },
          { status: 404 }
        );
      }
      console.error('Error updating transaction:', error);
      return NextResponse.json(
        { error: 'Failed to update transaction', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ transaction: data });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/transactions/[id]
 * Delete a transaction
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    // First check if transaction exists
    const { data: existing, error: checkError } = await supabase
      .from('transactions')
      .select('id')
      .eq('id', id)
      .single();

    if (checkError || !existing) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting transaction:', error);
      return NextResponse.json(
        { error: 'Failed to delete transaction', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: 'Transaction deleted' });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}

