package main

import (
	"context"
	"errors"
	"testing"
)

type unhealthyStore struct{ Store }

func (unhealthyStore) Health(context.Context) error { return errors.New("database unreachable") }

func TestLivenessIgnoresStorageWhileReadinessReportsIt(t *testing.T) {
	base, err := NewJSONStore("")
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(unhealthyStore{base}, testCurriculum(), nil, 10)
	t.Cleanup(app.Close)
	if w := request(app, "GET", "/api/health", "", nil); w.Code != 503 {
		t.Fatalf("readiness must report storage failure: %d", w.Code)
	}
	if w := request(app, "GET", "/api/live", "", nil); w.Code != 200 {
		t.Fatalf("liveness must not depend on storage: %d %s", w.Code, w.Body.String())
	}
}
