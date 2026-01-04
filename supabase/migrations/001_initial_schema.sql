-- Create enum type for market types
CREATE TYPE market_type_enum AS ENUM ('US', 'CN', 'HK', 'CRYPTO');

-- Create assets table
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(50) NOT NULL,
    market_type market_type_enum NOT NULL,
    quantity DECIMAL(20, 8) NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create portfolio_snapshots table
CREATE TABLE portfolio_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    total_value DECIMAL(20, 2) NOT NULL CHECK (total_value >= 0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_assets_market_type ON assets(market_type);
CREATE INDEX idx_assets_symbol ON assets(symbol);
CREATE INDEX idx_portfolio_snapshots_recorded_at ON portfolio_snapshots(recorded_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at on assets table
CREATE TRIGGER update_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE assets IS 'Stores user-owned assets with symbol, market type, and quantity';
COMMENT ON TABLE portfolio_snapshots IS 'Stores historical portfolio net worth snapshots recorded hourly';
COMMENT ON COLUMN assets.symbol IS 'Asset symbol (e.g., AAPL, 600519.SS, BTC)';
COMMENT ON COLUMN assets.market_type IS 'Market type: US (US Stocks), CN (China A-Shares), HK (HK Stocks), CRYPTO (Cryptocurrency)';
COMMENT ON COLUMN assets.quantity IS 'Quantity of the asset owned';
COMMENT ON COLUMN portfolio_snapshots.total_value IS 'Total portfolio value in base currency';
COMMENT ON COLUMN portfolio_snapshots.recorded_at IS 'Timestamp when the snapshot was recorded';

