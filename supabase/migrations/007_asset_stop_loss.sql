-- Per-asset three-tier stop-loss thresholds (Position Optimization → Stops)
CREATE TABLE IF NOT EXISTS asset_stop_loss (
    symbol VARCHAR(50) NOT NULL,
    market_type market_type_enum NOT NULL,
    relief_price DECIMAL(24, 8),
    relief_sell_pct DECIMAL(6, 2),
    retreat_price DECIMAL(24, 8),
    retreat_sell_pct DECIMAL(6, 2),
    bailout_price DECIMAL(24, 8),
    bailout_sell_pct DECIMAL(6, 2),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (symbol, market_type)
);

CREATE INDEX IF NOT EXISTS idx_asset_stop_loss_market ON asset_stop_loss (market_type);

COMMENT ON TABLE asset_stop_loss IS 'User-defined relief/retreat/bailout stop prices and sell percentages';

CREATE TRIGGER update_asset_stop_loss_updated_at
    BEFORE UPDATE ON asset_stop_loss
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Acknowledgements for triggered stop signals
CREATE TABLE IF NOT EXISTS asset_stop_loss_ack (
    symbol VARCHAR(50) NOT NULL,
    market_type market_type_enum NOT NULL,
    tier_id TEXT NOT NULL CHECK (tier_id IN ('relief', 'retreat', 'bailout')),
    stop_price DECIMAL(24, 8) NOT NULL,
    sell_pct DECIMAL(6, 2) NOT NULL,
    acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (symbol, market_type, tier_id)
);

COMMENT ON TABLE asset_stop_loss_ack IS 'User acknowledged stop-loss actions while price remained below tier';
