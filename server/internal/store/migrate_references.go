package store

import (
	"context"
	"encoding/json"
)

// ReferenceMigrator is implemented by stores that can rewrite every saved
// account and learning event in one transaction or save. It backs the opt-in
// content UUID migration (MIGRATE_CONTENT_UUIDS).
type ReferenceMigrator interface {
	MigrateReferences(ctx context.Context, migrate func(Account) Account, event func(key string, action SavedAction) (string, SavedAction)) error
}

func (base *JSONStore) MigrateReferences(_ context.Context, migrate func(Account) Account, event func(string, SavedAction) (string, SavedAction)) error {
	base.mu.Lock()
	defer base.mu.Unlock()
	old := base.state
	next := DiskState{Version: old.Version, World: old.World, WorldContent: old.WorldContent, Sessions: old.Sessions, SessionUse: old.SessionUse, Analytics: old.Analytics, Accounts: map[string]Account{}, Actions: map[string]map[string]SavedAction{}}
	for id, a := range old.Accounts {
		next.Accounts[id] = migrate(a)
	}
	for id, actions := range old.Actions {
		mapped := map[string]SavedAction{}
		for key, action := range actions {
			k, v := event(key, action)
			mapped[k] = v
		}
		next.Actions[id] = mapped
	}
	base.state = next
	if err := base.save(); err != nil {
		base.state = old
		return err
	}
	return nil
}

func (base *PGStore) MigrateReferences(ctx context.Context, migrate func(Account) Account, event func(string, SavedAction) (string, SavedAction)) error {
	tx, err := base.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `SELECT id,data FROM accounts FOR UPDATE`)
	if err != nil {
		return err
	}
	accounts := map[string][]byte{}
	for rows.Next() {
		var id string
		var data []byte
		if err = rows.Scan(&id, &data); err != nil {
			rows.Close()
			return err
		}
		var a Account
		if err = json.Unmarshal(data, &a); err != nil {
			rows.Close()
			return err
		}
		accounts[id], _ = json.Marshal(migrate(a))
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for id, data := range accounts {
		if _, err = tx.Exec(ctx, `UPDATE accounts SET data=$2 WHERE id=$1`, id, data); err != nil {
			return err
		}
	}
	rows, err = tx.Query(ctx, `SELECT account_id,event_key,request,receipt FROM learning_events FOR UPDATE`)
	if err != nil {
		return err
	}
	type update struct {
		id, old, key     string
		request, receipt []byte
	}
	var updates []update
	for rows.Next() {
		var id, key string
		var action SavedAction
		var receipt []byte
		if err = rows.Scan(&id, &key, &action.Request, &receipt); err != nil {
			rows.Close()
			return err
		}
		if err = json.Unmarshal(receipt, &action.Receipt); err != nil {
			rows.Close()
			return err
		}
		k, v := event(key, action)
		data, _ := json.Marshal(v.Receipt)
		updates = append(updates, update{id, key, k, v.Request, data})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, u := range updates {
		if _, err = tx.Exec(ctx, `UPDATE learning_events SET event_key=$3,request=$4,receipt=$5 WHERE account_id=$1 AND event_key=$2`, u.id, u.old, u.key, u.request, u.receipt); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
