package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestModularAvatarPersistence(t *testing.T) {
	app := testApp(t)
	avatar := Avatar{Hair: "#48372e", Skin: "#855338", Outfit: "#326a65", Pants: "#354d70", Face: "mature", Hairstyle: "hijab", Jacket: "vest", Bottom: "wide", Build: "full"}
	response := request(app, "POST", "/api/session", "", map[string]any{"name": "Willow", "avatar": avatar})
	if response.Code != http.StatusCreated {
		t.Fatalf("session: %d %s", response.Code, response.Body.String())
	}
	var session struct {
		Token  string `json:"token"`
		Player Player `json:"player"`
	}
	json.Unmarshal(response.Body.Bytes(), &session)
	response = request(app, "POST", "/api/session", session.Token, map[string]any{})
	var resumed struct {
		Player Player `json:"player"`
	}
	json.Unmarshal(response.Body.Bytes(), &resumed)
	if !sameAvatar(resumed.Player.Avatar, normalizeAvatar(avatar)) {
		t.Fatalf("pieces not preserved: %+v", resumed.Player.Avatar)
	}
	credentials := map[string]string{"email": "pieces@example.com", "password": "a long modular password"}
	if got := request(app, "POST", "/api/account/register", session.Token, credentials); got.Code != http.StatusOK {
		t.Fatalf("register: %d", got.Code)
	}
	loggedIn := request(app, "POST", "/api/account/login", "", credentials)
	if loggedIn.Code != http.StatusOK {
		t.Fatalf("login: %d", loggedIn.Code)
	}
	json.Unmarshal(loggedIn.Body.Bytes(), &resumed)
	if !sameAvatar(resumed.Player.Avatar, normalizeAvatar(avatar)) {
		t.Fatal("login lost character pieces")
	}
	avatar.Jacket = "../secret"
	if validAvatar(avatar) {
		t.Fatal("unknown jacket accepted")
	}
	if !validAvatar(Avatar{Hair: "#48372e", Skin: "#855338", Outfit: "#326a65"}) {
		t.Fatal("legacy profile rejected")
	}
}

func sameAvatar(a, b Avatar) bool {
	left, _ := json.Marshal(a)
	right, _ := json.Marshal(b)
	return string(left) == string(right)
}

func TestAvatarMigrationFixtures(t *testing.T) {
	data, err := os.ReadFile("testdata/avatar-migration.json")
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
			if !validAvatar(migrated) {
				t.Fatal("migration cannot be saved")
			}
		})
	}
}

func TestV2AvatarRejectsUnknownAndMissingValues(t *testing.T) {
	base := normalizeAvatar(Avatar{Hair: "#48372e", Skin: "#d6a07d", Outfit: "#326a65"})
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

func TestV2AvatarSurvivesUpdateAndRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "accounts.json")
	store, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	avatar := normalizeAvatar(Avatar{Hair: "#48372e", Skin: "#d6a07d", Outfit: "#326a65"})
	response := request(app, "POST", "/api/session", "", map[string]any{"name": "Willow", "avatar": avatar})
	var session struct {
		Token  string
		Player Player
	}
	if response.Code != http.StatusCreated {
		t.Fatal(response.Code, response.Body.String())
	}
	if err := json.Unmarshal(response.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}
	skirt := "skirt"
	avatar.Parts["bottom"] = &skirt
	avatar.Parts["hair"] = nil
	avatar.Colors["bottom.primary"] = "#abc123"
	response = request(app, "POST", "/api/session", session.Token, map[string]any{"name": "Willow", "avatar": avatar})
	if response.Code != http.StatusOK {
		t.Fatal(response.Code, response.Body.String())
	}
	credentials := map[string]string{"email": "v2@example.com", "password": "a long recipe password"}
	if response = request(app, "POST", "/api/account/register", session.Token, credentials); response.Code != http.StatusOK {
		t.Fatal(response.Code, response.Body.String())
	}
	app.Close()
	reopened, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	app = NewApp(reopened, testCurriculum(), nil, 10)
	defer app.Close()
	for _, check := range []struct {
		token string
		path  string
		body  any
	}{
		{session.Token, "/api/session", map[string]any{}},
		{"", "/api/account/login", credentials},
	} {
		response = request(app, "POST", check.path, check.token, check.body)
		if response.Code != http.StatusOK {
			t.Fatal(response.Code, response.Body.String())
		}
		if err := json.Unmarshal(response.Body.Bytes(), &session); err != nil {
			t.Fatal(err)
		}
		if !sameAvatar(session.Player.Avatar, avatar) {
			t.Fatalf("v2 recipe changed on %s: %+v", check.path, session.Player.Avatar)
		}
	}
}

func TestV2BuildWardrobesPersistAndRejectForeignOptions(t *testing.T) {
	app := testApp(t)
	base := normalizeAvatar(Avatar{Hair: "#48372e", Skin: "#d6a07d"})
	for _, build := range []string{"slim", "broad"} {
		t.Run(build, func(t *testing.T) {
			base.Build = build
			avatar := normalizeAvatar(base)
			tee, skirt, waves, travel := "tee", "skirt", "waves", "travel"
			avatar.Parts["top"], avatar.Parts["bottom"] = &tee, &skirt
			avatar.Parts["hair"], avatar.Parts["outer"] = &waves, &travel
			avatar.Colors["bottom.primary"] = "#b07b41"
			response := request(app, "POST", "/api/session", "", map[string]any{"name": "Willow", "avatar": avatar})
			if response.Code != http.StatusCreated {
				t.Fatal(response.Code, response.Body.String())
			}
			var session struct {
				Token  string
				Player Player
			}
			if err := json.Unmarshal(response.Body.Bytes(), &session); err != nil {
				t.Fatal(err)
			}
			if !sameAvatar(session.Player.Avatar, avatar) {
				t.Fatalf("build changed: %+v", session.Player.Avatar)
			}
			response = request(app, "POST", "/api/session", session.Token, map[string]any{})
			if response.Code != http.StatusOK {
				t.Fatal(response.Code, response.Body.String())
			}
			if err := json.Unmarshal(response.Body.Bytes(), &session); err != nil {
				t.Fatal(err)
			}
			if !sameAvatar(session.Player.Avatar, avatar) {
				t.Fatal("resume lost build wardrobe")
			}
			cap := "cap"
			avatar.Parts["headwear"] = &cap
			data, err := json.Marshal(avatar)
			if err != nil {
				t.Fatal(err)
			}
			var decoded Avatar
			if err := json.Unmarshal(data, &decoded); err == nil {
				t.Fatal("regular-only cap accepted on extra build")
			}
		})
	}
}
