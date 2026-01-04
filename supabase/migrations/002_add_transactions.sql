-- Migration: Add transactions table for tracking buy/sell operations with dates
-- This enables historical portfolio tracking and net worth calculation

-- Create transaction_type enum
CREATE TYPE transaction_type_enum AS ENUM ('BUY', 'SELL');

-- Create transactions table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(50) NOT NULL,
    market_type market_type_enum NOT NULL,
    transaction_type transaction_type_enum NOT NULL DEFAULT 'BUY',
    quantity DECIMAL(20, 8) NOT NULL CHECK (quantity > 0),
    price_per_unit DECIMAL(20, 8), -- Optional: record price at transaction time
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_transactions_symbol ON transactions(symbol);
CREATE INDEX idx_transactions_market_type ON transactions(market_type);
CREATE INDEX idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX idx_transactions_symbol_date ON transactions(symbol, transaction_date);

-- Create trigger to automatically update updated_at on transactions table
CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE transactions IS 'Stores buy/sell transactions with dates for historical portfolio tracking';
COMMENT ON COLUMN transactions.symbol IS 'Asset symbol (e.g., AAPL, 600519, BTC)';
COMMENT ON COLUMN transactions.market_type IS 'Market type: US, CN, HK, or CRYPTO';
COMMENT ON COLUMN transactions.transaction_type IS 'BUY or SELL';
COMMENT ON COLUMN transactions.quantity IS 'Quantity of the asset traded (always positive)';
COMMENT ON COLUMN transactions.price_per_unit IS 'Optional: price per unit at transaction time for cost basis tracking';
COMMENT ON COLUMN transactions.transaction_date IS 'Date when the transaction occurred';
COMMENT ON COLUMN transactions.notes IS 'Optional notes for the transaction';

-- Migrate existing assets to transactions (one-time migration)
-- This converts existing assets to BUY transactions with today's date
INSERT INTO transactions (symbol, market_type, transaction_type, quantity, transaction_date, notes)
SELECT 
    symbol, 
    market_type, 
    'BUY'::transaction_type_enum, 
    quantity, 
    created_at::date,
    'Migrated from assets table'
FROM assets;

-- Create a view to calculate current holdings from transactions
CREATE OR REPLACE VIEW current_holdings AS
SELECT 
    symbol,
    market_type,
    SUM(CASE WHEN transaction_type = 'BUY' THEN quantity ELSE -quantity END) as quantity,
    MIN(transaction_date) as first_transaction_date,
    MAX(transaction_date) as last_transaction_date,
    COUNT(*) as transaction_count
FROM transactions
GROUP BY symbol, market_type
HAVING SUM(CASE WHEN transaction_type = 'BUY' THEN quantity ELSE -quantity END) > 0;

COMMENT ON VIEW current_holdings IS 'Calculated current holdings based on all buy/sell transactions';

