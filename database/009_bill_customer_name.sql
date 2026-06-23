-- Lets staff label an open bill with a customer/tab name (e.g. "John", "Room 4")
-- when payment is incomplete, so it's clear whose outstanding balance it is
-- when they come back to pay later. Purely descriptive — no behavior depends on it.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS customer_name TEXT;
