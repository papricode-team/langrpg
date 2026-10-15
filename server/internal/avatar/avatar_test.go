package avatar

import (
	"encoding/json"
	"os"
	"testing"
)

// The catalogue and the migration fixtures are shared with the web client,
// so the tests read them from their published paths under server/.
func TestMain(m *testing.M) {
	data, err := os.ReadFile("../../character-kit.json")
	if err != nil {
		panic(err)
	}
	MustLoad(data)
	os.Exit(m.Run())
}

func sameAvatar(a, b Avatar) bool {
	left, _ := json.Marshal(a)
	right, _ := json.Marshal(b)
	return string(left) == string(right)
}

func TestAvatarMigrationFixtures(t *testing.T) {
	data, err := os.ReadFile("../../testdata/avatar-migration.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct {
		Name     string
		Input    json.RawMessage
		Expected Avatar
	}
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, fixture := range fixtures {
		t.Run(fixture.Name, func(t *testing.T) {
			var migrated Avatar
			if err := json.Unmarshal(fixture.Input, &migrated); err != nil {
				t.Fatal(err)
			}
			if !sameAvatar(migrated, fixture.Expected) {
				t.Fatalf("migration differs from client: %+v; expected %+v", migrated, fixture.Expected)
			}
			if !Valid(migrated) {
				t.Fatal("migration cannot be saved")
			}
		})
	}
}

func TestV2AvatarRejectsUnknownAndMissingValues(t *testing.T) {
	base := Normalize(Avatar{Hair: "#48372e", Skin: "#d6a07d", Outfit: "#326a65"})
	for name, mutate := range map[string]func(map[string]any){
		"unknown field":    func(a map[string]any) { a["outfit"] = "#ffffff" },
		"future version":   func(a map[string]any) { a["v"] = 3 },
		"unknown build":    func(a map[string]any) { a["build"] = "removed" },
		"unknown slot":     func(a map[string]any) { a["parts"].(map[string]any)["tail"] = nil },
		"removed option":   func(a map[string]any) { a["parts"].(map[string]any)["bottom"] = "removed" },
		"missing slot":     func(a map[string]any) { delete(a["parts"].(map[string]any), "hair") },
		"missing required": func(a map[string]any) { a["parts"].(map[string]any)["face"] = nil },
		"unknown color":    func(a map[string]any) { a["colors"].(map[string]any)["tail.primary"] = "#ffffff" },
		"named color":      func(a map[string]any) { a["colors"].(map[string]any)["top.primary"] = "red" },
		"null parts":       func(a map[string]any) { a["parts"] = nil },
	} {
		t.Run(name, func(t *testing.T) {
			data, _ := json.Marshal(base)
			var input map[string]any
			if err := json.Unmarshal(data, &input); err != nil {
				t.Fatal(err)
			}
			mutate(input)
			data, _ = json.Marshal(input)
			var decoded Avatar
			if err := json.Unmarshal(data, &decoded); err == nil {
				t.Fatal("invalid recipe accepted")
			}
		})
	}
}
