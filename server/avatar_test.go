package main

import (
	"encoding/json"
	"glotworld/server/internal/avatar"
	"net/http"
	"path/filepath"
	"testing"
)

func TestModularAvatarPersistence(t *testing.T) {
	app := testApp(t)
	recipe := Avatar{Hair: "#48372e", Skin: "#855338", Outfit: "#326a65", Pants: "#354d70", Face: "mature", Hairstyle: "hijab", Jacket: "vest", Bottom: "wide", Build: "full"}
	response := request(app, "POST", "/api/session", "", map[string]any{"name": "Willow", "avatar": recipe})
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
	if !sameAvatar(resumed.Player.Avatar, avatar.Normalize(recipe)) {
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
	if !sameAvatar(resumed.Player.Avatar, avatar.Normalize(recipe)) {
		t.Fatal("login lost character pieces")
	}
	recipe.Jacket = "../secret"
	if avatar.Valid(recipe) {
		t.Fatal("unknown jacket accepted")
	}
	if !avatar.Valid(Avatar{Hair: "#48372e", Skin: "#855338", Outfit: "#326a65"}) {
		t.Fatal("legacy profile rejected")
	}
}

func sameAvatar(a, b Avatar) bool {
	left, _ := json.Marshal(a)
	right, _ := json.Marshal(b)
	return string(left) == string(right)
}

func TestV2AvatarSurvivesUpdateAndRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "accounts.json")
	store, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	recipe := avatar.Normalize(Avatar{Hair: "#48372e", Skin: "#d6a07d", Outfit: "#326a65"})
	response := request(app, "POST", "/api/session", "", map[string]any{"name": "Willow", "avatar": recipe})
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
	recipe.Parts["bottom"] = &skirt
	recipe.Parts["hair"] = nil
	recipe.Colors["bottom.primary"] = "#abc123"
	response = request(app, "POST", "/api/session", session.Token, map[string]any{"name": "Willow", "avatar": recipe})
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
		if !sameAvatar(session.Player.Avatar, recipe) {
			t.Fatalf("v2 recipe changed on %s: %+v", check.path, session.Player.Avatar)
		}
	}
}

func TestV2BuildWardrobesPersistAndRejectInvalidOptions(t *testing.T) {
	app := testApp(t)
	base := avatar.Normalize(Avatar{Hair: "#48372e", Skin: "#d6a07d"})
	for _, build := range []string{"slim", "broad"} {
		t.Run(build, func(t *testing.T) {
			base.Build = build
			recipe := avatar.Normalize(base)
			tee, skirt, waves, travel, cap := "tee", "skirt", "waves", "travel", "cap"
			recipe.Parts["top"], recipe.Parts["bottom"] = &tee, &skirt
			recipe.Parts["hair"], recipe.Parts["outer"] = &waves, &travel
			recipe.Parts["headwear"] = &cap
			recipe.Colors["bottom.primary"] = "#b07b41"
			response := request(app, "POST", "/api/session", "", map[string]any{"name": "Willow", "avatar": recipe})
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
			if !sameAvatar(session.Player.Avatar, recipe) {
				t.Fatalf("build changed: %+v", session.Player.Avatar)
			}
			response = request(app, "POST", "/api/session", session.Token, map[string]any{})
			if response.Code != http.StatusOK {
				t.Fatal(response.Code, response.Body.String())
			}
			if err := json.Unmarshal(response.Body.Bytes(), &session); err != nil {
				t.Fatal(err)
			}
			if !sameAvatar(session.Player.Avatar, recipe) {
				t.Fatal("resume lost build wardrobe")
			}
			// A real option from another slot is still invalid as headwear.
			recipe.Parts["headwear"] = &tee
			data, err := json.Marshal(recipe)
			if err != nil {
				t.Fatal(err)
			}
			var decoded Avatar
			if err := json.Unmarshal(data, &decoded); err == nil {
				t.Fatal("top option accepted as headwear")
			}
		})
	}
}
