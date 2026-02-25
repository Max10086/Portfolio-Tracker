-- Migration: Add optional tag field for categorizing assets (e.g., "Tech", "Dividend")
-- Tag is stored per transaction; holdings inherit tag from the most recent transaction

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tag VARCHAR(100);

COMMENT ON COLUMN transactions.tag IS 'Optional category/tag for the asset (e.g., Tech, Dividend). Used for allocation by tag.';
