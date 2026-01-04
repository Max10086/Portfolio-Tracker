-- Add CASH to market_type_enum
ALTER TYPE market_type_enum ADD VALUE IF NOT EXISTS 'CASH';

-- Add comment for CASH market type
COMMENT ON TYPE market_type_enum IS 'Market type: US (US Stocks), CN (China A-Shares), HK (HK Stocks), CRYPTO (Cryptocurrency), CASH (Cash holdings in USD/CNY/HKD)';

