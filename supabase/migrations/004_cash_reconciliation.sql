-- Migration: Cash reconciliation for buy/sell transactions
-- When buying/selling non-cash assets, automatically adjust the selected Cash asset balance.
-- Uses a PostgreSQL function to guarantee atomicity (both inserts succeed or both fail).

-- Function: Execute main transaction + paired cash transaction atomically
CREATE OR REPLACE FUNCTION execute_transaction_with_cash_update(
  p_symbol VARCHAR(50),
  p_market_type market_type_enum,
  p_transaction_type transaction_type_enum,
  p_quantity DECIMAL,
  p_price_per_unit DECIMAL,
  p_transaction_date DATE,
  p_notes TEXT,
  p_cash_symbol VARCHAR(50),
  p_cash_quantity DECIMAL
) RETURNS UUID AS $$
DECLARE
  v_main_tx_id UUID;
  v_cash_tx_type transaction_type_enum;
BEGIN
  -- BUY stock => SELL cash (decrement cash)
  -- SELL stock => BUY cash (increment cash)
  v_cash_tx_type := CASE WHEN p_transaction_type = 'BUY' THEN 'SELL'::transaction_type_enum ELSE 'BUY'::transaction_type_enum END;

  -- Insert main transaction (stock/crypto)
  INSERT INTO transactions (symbol, market_type, transaction_type, quantity, price_per_unit, transaction_date, notes)
  VALUES (p_symbol, p_market_type, p_transaction_type, p_quantity, p_price_per_unit, p_transaction_date, p_notes)
  RETURNING id INTO v_main_tx_id;

  -- Insert paired cash transaction (quantity = transaction value, price_per_unit = 1 for cash)
  INSERT INTO transactions (symbol, market_type, transaction_type, quantity, price_per_unit, transaction_date, notes)
  VALUES (p_cash_symbol, 'CASH'::market_type_enum, v_cash_tx_type, p_cash_quantity, 1, p_transaction_date, 'Auto: cash balance update for ' || p_symbol);

  RETURN v_main_tx_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION execute_transaction_with_cash_update IS 'Atomically inserts a main transaction and its paired cash balance update';
