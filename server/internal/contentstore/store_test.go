package contentstore

import (
	"encoding/json"
	"path/filepath"
	"testing"
)

func catalogueData(records map[string][]Record, ids map[string]string) []byte {
	data, _ := json.Marshal(map[string]any{"version": 1, "records": records, "ids": ids})
	return data
}

func TestCatalogueRejectsUnstableInvalidAndDuplicateIdentities(t *testing.T) {
	r := Record{ID: "11111111-1111-4111-8111-111111111111", Slug: "sentence", Version: 1, Body: json.RawMessage(`{"de":{"text":"Hallo"}}`)}
	for name, data := range map[string][]byte{
		"unstable":     catalogueData(map[string][]Record{"lines": {r}}, map[string]string{"lines:sentence": "22222222-2222-4222-8222-222222222222"}),
		"duplicate":    catalogueData(map[string][]Record{"lines": {r}, "lexemes": {r}}, nil),
		"unknown kind": catalogueData(map[string][]Record{"private": {r}}, nil),
		"invalid uuid": catalogueData(map[string][]Record{"lines": {{ID: "readable", Slug: "sentence", Version: 1, Body: r.Body}}}, nil),
		"invalid body": catalogueData(map[string][]Record{"lines": {{ID: r.ID, Slug: r.Slug, Version: 1, Body: json.RawMessage(`[]`)}}}, nil),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := Parse(data); err == nil {
				t.Fatal("invalid catalogue was accepted")
			}
		})
	}
}

func TestCatalogueJSONImportRetainsStableMapAndPrivateGrading(t *testing.T) {
	r := Record{ID: "11111111-1111-4111-8111-111111111111", Slug: "sentence", Version: 1, Body: json.RawMessage(`{"de":{"text":"Hallo"}}`)}
	c, err := Parse(catalogueData(map[string][]Record{"lines": {r}}, nil))
	if err != nil {
		t.Fatal(err)
	}
	c.Grading = json.RawMessage(`{"exercises":[{"answer":"private"}]}`)
	path := filepath.Join(t.TempDir(), "content.json")
	if err := c.Save(path); err != nil {
		t.Fatal(err)
	}
	loaded, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Resolve("lines", "sentence") != r.ID || loaded.Slug(r.ID) != r.Slug || string(loaded.Grading) != string(c.Grading) {
		t.Fatal("import did not preserve catalogue identities and grading")
	}
}
