-- Serves FindBillingAccount's containment lookup of refunds and disputes by
-- subscription or transaction ID.
CREATE INDEX IF NOT EXISTS accounts_billing_purchases ON accounts USING GIN ((data->'billing'->'purchases') jsonb_path_ops);
