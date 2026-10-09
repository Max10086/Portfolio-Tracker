-- Pre-trade Gatekeeper self-check sessions (Position Optimization → Gatekeeper)
CREATE TABLE IF NOT EXISTS gatekeeper_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(50) NOT NULL,
    market_type market_type_enum NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
    checklist_version TEXT NOT NULL,
    answers JSONB NOT NULL DEFAULT '{}',
    calculator JSONB,
    passed BOOLEAN NOT NULL DEFAULT FALSE,
    saved_without_order BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gatekeeper_sessions_ticker
    ON gatekeeper_sessions (symbol, market_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gatekeeper_sessions_created
    ON gatekeeper_sessions (created_at DESC);

COMMENT ON TABLE gatekeeper_sessions IS 'Pre-trade checklist answers and risk calculator snapshot';
