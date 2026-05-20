-- Currency defaults v1 additive migration.
-- Keeps explicit restaurant currency values intact and makes missing/future values default to NPR.

ALTER TABLE restaurants ALTER COLUMN currency SET DEFAULT 'NPR';
UPDATE restaurants
SET currency = 'NPR'
WHERE currency IS NULL OR btrim(currency) = '';
