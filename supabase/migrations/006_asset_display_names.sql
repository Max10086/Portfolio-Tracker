-- Cached human-readable names for symbol + market (avoids repeated quote API lookups)
CREATE TABLE IF NOT EXISTS asset_display_names (
    symbol VARCHAR(50) NOT NULL,
    market_type market_type_enum NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (symbol, market_type)
);

CREATE INDEX IF NOT EXISTS idx_asset_display_names_market ON asset_display_names (market_type);

COMMENT ON TABLE asset_display_names IS 'Display names resolved from market data APIs; keyed by symbol and market_type';

CREATE TRIGGER update_asset_display_names_updated_at
    BEFORE UPDATE ON asset_display_names
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
