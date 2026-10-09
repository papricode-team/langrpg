package main

import (
	"encoding/json"
	"net/http"
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
	if resumed.Player.Avatar != avatar {
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
	if resumed.Player.Avatar != avatar {
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
