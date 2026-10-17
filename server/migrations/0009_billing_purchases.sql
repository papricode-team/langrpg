-- Recorded Creem purchases move out of accounts.data->'billing'->'purchases'
-- into rows, so refund and dispute webhooks find their account by index.
-- checkout_id is the purchase reference: a checkout is bound to one account,
-- and a duplicate fails this migration rather than dropping a paid purchase.
-- position keeps the recorded order, which billing.SameLedger compares. A
-- trigger keeps the rows in step with data for binaries that write only data.

CREATE TABLE IF NOT EXISTS billing_purchases (
 checkout_id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 position INTEGER NOT NULL,
 request_id TEXT NOT NULL DEFAULT '',
 product_id TEXT NOT NULL DEFAULT '',
 plan TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL,
 customer_id TEXT NOT NULL DEFAULT '',
 subscription_id TEXT NOT NULL DEFAULT '',
 order_id TEXT NOT NULL DEFAULT '',
 transaction_id TEXT NOT NULL DEFAULT '',
 CONSTRAINT billing_purchases_account_position UNIQUE (account_id, position) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS billing_purchases_subscription ON billing_purchases(subscription_id) WHERE subscription_id <> '';
CREATE INDEX IF NOT EXISTS billing_purchases_transaction ON billing_purchases(transaction_id) WHERE transaction_id <> '';

CREATE OR REPLACE FUNCTION accounts_sync_purchases() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.data->'billing'->'purchases' IS NOT DISTINCT FROM OLD.data->'billing'->'purchases' THEN
    RETURN NULL;
  END IF;
  DELETE FROM billing_purchases WHERE account_id = NEW.id;
  INSERT INTO billing_purchases(checkout_id, account_id, position, request_id, product_id, plan, created_at, customer_id, subscription_id, order_id, transaction_id)
  SELECT p->>'checkoutId', NEW.id, (t.ord - 1)::int,
    COALESCE(p->>'requestId', ''), COALESCE(p->>'productId', ''), COALESCE(p->>'plan', ''),
    (p->>'createdAt')::timestamptz,
    COALESCE(p->>'customerId', ''), COALESCE(p->>'subscriptionId', ''), COALESCE(p->>'orderId', ''), COALESCE(p->>'transactionId', '')
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.data->'billing'->'purchases') = 'array' THEN NEW.data->'billing'->'purchases' ELSE '[]' END) WITH ORDINALITY AS t(p, ord);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS accounts_sync_purchases ON accounts;
CREATE TRIGGER accounts_sync_purchases AFTER INSERT OR UPDATE OF data ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_sync_purchases();

INSERT INTO billing_purchases(checkout_id, account_id, position, request_id, product_id, plan, created_at, customer_id, subscription_id, order_id, transaction_id)
SELECT p->>'checkoutId', a.id, (t.ord - 1)::int,
  COALESCE(p->>'requestId', ''), COALESCE(p->>'productId', ''), COALESCE(p->>'plan', ''),
  (p->>'createdAt')::timestamptz,
  COALESCE(p->>'customerId', ''), COALESCE(p->>'subscriptionId', ''), COALESCE(p->>'orderId', ''), COALESCE(p->>'transactionId', '')
FROM accounts a, jsonb_array_elements(CASE WHEN jsonb_typeof(a.data->'billing'->'purchases') = 'array' THEN a.data->'billing'->'purchases' ELSE '[]' END) WITH ORDINALITY AS t(p, ord);
