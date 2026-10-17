-- The account fields the server searches move out of accounts.data into
-- columns. A trigger derives them from data, so a binary that writes only data
-- keeps them correct; current binaries also write them directly. The
-- expression index on data->>'email' stays while such binaries may run.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS player_name TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION accounts_sync_columns() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.email := NULLIF(NEW.data->>'email', '');
  NEW.created_at := (NEW.data->>'createdAt')::timestamptz;
  NEW.player_name := COALESCE(NEW.data->'player'->>'name', '');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS accounts_sync_columns ON accounts;
CREATE TRIGGER accounts_sync_columns BEFORE INSERT OR UPDATE OF data ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_sync_columns();

-- Fires the trigger for every existing row.
UPDATE accounts SET data = data;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_key ON accounts(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS accounts_created_at ON accounts(created_at DESC, id);
