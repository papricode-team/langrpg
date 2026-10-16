package store

import (
	"bytes"
	"context"
	"encoding/json"
	"glotworld/server/internal/billing"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
)

// An account row keeps the fields the server searches in columns (email,
// created_at, player_name) and its recorded purchases in billing_purchases;
// the rest of the account is the data document. Reads take those fields from
// the columns and rows, and every write goes through writeAccount, so no call
// site can update the document without them.
//
// Until the document stops carrying these fields, it keeps them too and
// triggers (migrations 0008 and 0009) derive the columns and rows from it for
// binaries that write only the document.

// pgAccountColumns selects what scanAccount reads, from accounts aliased a.
const pgAccountColumns = `a.id,a.data,a.email,a.created_at,COALESCE((SELECT json_agg(json_build_object('checkoutId',p.checkout_id,'requestId',p.request_id,'productId',p.product_id,'createdAt',p.created_at,'customerId',p.customer_id,'subscriptionId',p.subscription_id,'orderId',p.order_id,'transactionId',p.transaction_id,'plan',p.plan) ORDER BY p.position) FROM billing_purchases p WHERE p.account_id=a.id),'[]')`

type pgAccountRow struct {
	id        string
	data      []byte
	email     *string
	createdAt *time.Time
	purchases []byte
}

// targets returns the scan destinations for pgAccountColumns.
func (r *pgAccountRow) targets() []any {
	return []any{&r.id, &r.data, &r.email, &r.createdAt, &r.purchases}
}

func (s *PGStore) decodeAccount(r pgAccountRow) (Account, error) {
	var a Account
	if err := json.Unmarshal(r.data, &a); err != nil {
		return Account{}, err
	}
	a.Email = ""
	if r.email != nil {
		a.Email = *r.email
	}
	if r.createdAt != nil {
		a.CreatedAt = r.createdAt.UTC()
	}
	a.Billing.Purchases = nil
	if err := json.Unmarshal(r.purchases, &a.Billing.Purchases); err != nil {
		return Account{}, err
	}
	if len(a.Billing.Purchases) == 0 {
		a.Billing.Purchases = nil
	}
	for i := range a.Billing.Purchases {
		a.Billing.Purchases[i].CreatedAt = a.Billing.Purchases[i].CreatedAt.UTC()
	}
	s.hooks.NormalizeProgress(&a.Progress)
	return a, nil
}

// scanAccount reads one row selected with pgAccountColumns, followed by any
// extra columns, and returns the row's account id with the account.
func (s *PGStore) scanAccount(row pgx.Row, extra ...any) (string, Account, error) {
	var r pgAccountRow
	if err := row.Scan(append(r.targets(), extra...)...); err != nil {
		return "", Account{}, err
	}
	a, err := s.decodeAccount(r)
	return r.id, a, err
}

func nullableText(value string) any {
	if value == "" {
		return nil
	}
	return value
}

// insertAccount stores a new account.
func (s *PGStore) insertAccount(ctx context.Context, tx pgx.Tx, a Account) error {
	data, err := json.Marshal(a)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO accounts(id,data,email,created_at,player_name) VALUES($1,$2,$3,$4,$5)`, a.Player.ID, data, nullableText(a.Email), a.CreatedAt, a.Player.Name); err != nil {
		return err
	}
	return replacePurchases(ctx, tx, a.Player.ID, a.Billing.Purchases)
}

// writeAccount updates account id inside the transaction that locked it.
// before is the purchase list the account was read with; the purchase rows
// are rewritten only when the list changed.
func (s *PGStore) writeAccount(ctx context.Context, tx pgx.Tx, id string, before []billing.Purchase, a Account) error {
	data, err := json.Marshal(a)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE accounts SET data=$2,email=$3,created_at=$4,player_name=$5 WHERE id=$1`, id, data, nullableText(a.Email), a.CreatedAt, a.Player.Name); err != nil {
		return err
	}
	if samePurchases(before, a.Billing.Purchases) {
		return nil
	}
	return replacePurchases(ctx, tx, id, a.Billing.Purchases)
}

func samePurchases(left, right []billing.Purchase) bool {
	if len(left) != len(right) {
		return false
	}
	l, _ := json.Marshal(left)
	r, _ := json.Marshal(right)
	return bytes.Equal(l, r)
}

// clonePurchases copies the list an account was read with, so writeAccount can
// compare it with the list after a change.
func clonePurchases(purchases []billing.Purchase) []billing.Purchase {
	return slices.Clone(purchases)
}

func replacePurchases(ctx context.Context, tx pgx.Tx, id string, purchases []billing.Purchase) error {
	batch := &pgx.Batch{}
	batch.Queue(`DELETE FROM billing_purchases WHERE account_id=$1`, id)
	for i, p := range purchases {
		batch.Queue(`INSERT INTO billing_purchases(checkout_id,account_id,position,request_id,product_id,plan,created_at,customer_id,subscription_id,order_id,transaction_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
			p.CheckoutID, id, i, p.RequestID, p.ProductID, p.Plan, p.CreatedAt, p.CustomerID, p.SubscriptionID, p.OrderID, p.TransactionID)
	}
	return tx.SendBatch(ctx, batch).Close()
}
