-- Add 'waiter' to service_request_type enum
ALTER TYPE service_request_type ADD VALUE IF NOT EXISTS 'waiter';
