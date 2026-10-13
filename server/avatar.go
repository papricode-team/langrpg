package main

import (
	"encoding/json"
	"errors"
	"regexp"
	"slices"
	"strings"
)

type avatarSlot struct {
	ID            string `json:"id"`
	Optional      bool   `json:"optional"`
	DefaultOption string `json:"defaultOption"`
}
type avatarComponent struct {
	OptionID string   `json:"optionId"`
	Slot     string   `json:"slot"`
	Build    string   `json:"build"`
	Occupies []string `json:"occupies"`
}
type avatarCatalog struct {
	RecipeVersion int               `json:"recipeVersion"`
	Builds        []string          `json:"builds"`
	Slots         []avatarSlot      `json:"slots"`
	Components    []avatarComponent `json:"components"`
	ColorKeys     []string          `json:"colorKeys"`
	DefaultColors map[string]string `json:"defaultColors"`
}

var avatarCatalogue = func() avatarCatalog {
	data, err := curriculumFiles.ReadFile("character-kit.json")
	if err != nil {
		panic(err)
	}
	var catalogue avatarCatalog
	if err := json.Unmarshal(data, &catalogue); err != nil {
		panic(err)
	}
	if catalogue.RecipeVersion != 2 || len(catalogue.Builds) == 0 {
		panic("invalid character catalogue")
	}
	return catalogue
}()
var avatarHex = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func (a Avatar) empty() bool {
	return a.V == 0 && a.Hair == "" && a.Skin == "" && a.Outfit == "" && a.Build == "" && a.Face == "" && a.Hairstyle == "" && a.Jacket == "" && a.Bottom == "" && a.Pants == "" && a.Parts == nil && a.Colors == nil
}

// Decode legacy storage and network input identically. V2 is never repaired on
// save: removed options, unknown fields and unknown colour keys are rejected.
func (a *Avatar) UnmarshalJSON(data []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	if fields == nil {
		return errors.New("avatar must be an object")
	}
	if len(fields) == 0 {
		*a = Avatar{}
		return nil
	}
	type plain Avatar
	var decoded plain
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	allowed := []string{"v", "build", "skin", "hair", "parts", "colors"}
	if decoded.V != 2 {
		allowed = []string{"v", "build", "skin", "hair", "outfit", "face", "hairstyle", "jacket", "bottom", "pants", "parts"}
	}
	for key := range fields {
		if !slices.Contains(allowed, key) {
			return errors.New("unknown avatar field: " + key)
		}
	}
	value := Avatar(decoded)
	if value.empty() {
		*a = value
		return nil
	}
	if !validAvatar(value) {
		return errors.New("invalid avatar recipe")
	}
	*a = normalizeAvatar(value)
	return nil
}

func validAvatar(a Avatar) bool {
	if a.V != 2 {
		return (a.V == 0 || a.V == 1) && validLegacyAvatar(a)
	}
	if !slices.Contains(avatarCatalogue.Builds, a.Build) || !avatarHex.MatchString(a.Hair) || !avatarHex.MatchString(a.Skin) || a.Parts == nil || a.Colors == nil {
		return false
	}
	if a.Face != "" || a.Hairstyle != "" || a.Jacket != "" || a.Bottom != "" || a.Pants != "" || a.Outfit != "" {
		return false
	}
	occupied := map[string]bool{}
	for _, component := range avatarCatalogue.Components {
		if id := a.Parts[component.Slot]; component.Build == a.Build && id != nil && *id == component.OptionID {
			for _, slot := range component.Occupies {
				if slot != component.Slot {
					occupied[slot] = true
				}
			}
		}
	}
	for slot, id := range a.Parts {
		if !slices.ContainsFunc(avatarCatalogue.Slots, func(s avatarSlot) bool { return s.ID == slot && slot != "body" }) {
			return false
		}
		if id != nil && !slices.ContainsFunc(avatarCatalogue.Components, func(c avatarComponent) bool { return c.Build == a.Build && c.Slot == slot && c.OptionID == *id }) {
			return false
		}
	}
	for _, slot := range avatarCatalogue.Slots {
		if slot.ID == "body" {
			continue
		}
		id, present := a.Parts[slot.ID]
		if !present || (id == nil && !slot.Optional && !occupied[slot.ID]) {
			return false
		}
	}
	for key, color := range a.Colors {
		if !slices.Contains(avatarCatalogue.ColorKeys, key) || !avatarHex.MatchString(color) {
			return false
		}
	}
	return true
}

// Historical choices are accepted only for migration. New v2 options always
// come from the generated catalogue above, including future builds and slots.
func validLegacyAvatar(a Avatar) bool {
	if !paletteValue.MatchString(a.Hair) || !paletteValue.MatchString(a.Skin) || !paletteValue.MatchString(a.Outfit) || a.Colors != nil {
		return false
	}
	values := map[string]string{"face": a.Face, "hairstyle": a.Hairstyle, "jacket": a.Jacket, "bottom": a.Bottom, "build": a.Build, "pants": a.Pants}
	for key, value := range a.Parts {
		if _, ok := values[key]; !ok {
			return false
		}
		if value != nil {
			values[key] = *value
		}
	}
	if values["pants"] != "" && !paletteValue.MatchString(values["pants"]) {
		return false
	}
	for key, choices := range map[string]string{
		"face":      "oval square angular round long almond mature bearded",
		"hairstyle": "bald crop bob waves locs braids afro coils pixie ponytail hijab turban silver elder straight bun buzz",
		"jacket":    "travel bomber blazer vest tunic denim", "bottom": "straight wide", "build": "slender regular broad full",
	} {
		if values[key] != "" && !slices.Contains(strings.Fields(choices), values[key]) {
			return false
		}
	}
	return true
}

func normalizeAvatar(a Avatar) Avatar {
	build := a.Build
	legacy := a.V != 2
	old := map[string]string{"build": a.Build, "face": a.Face, "hairstyle": a.Hairstyle, "jacket": a.Jacket, "bottom": a.Bottom, "pants": a.Pants}
	if legacy {
		for key, value := range a.Parts {
			if value != nil {
				old[key] = *value
			} else {
				old[key] = ""
			}
		}
		// Preserve what V1 actually rendered, independent of later catalogue growth.
		build = "regular"
	}
	if !slices.Contains(avatarCatalogue.Builds, build) {
		build = "regular"
		if !slices.Contains(avatarCatalogue.Builds, build) {
			build = avatarCatalogue.Builds[0]
		}
	}
	color := func(value, key string) string {
		if avatarHex.MatchString(value) {
			return strings.ToLower(value)
		}
		return avatarCatalogue.DefaultColors[key]
	}
	out := Avatar{V: 2, Build: build, Skin: color(a.Skin, "skin"), Hair: color(a.Hair, "hair"), Parts: map[string]*string{}, Colors: map[string]string{}}
	wanted := a.Parts
	if legacy {
		face, hair, outer, bottom, boots := "oval", "waves", "travel", "straight", "boots"
		wanted = map[string]*string{"face": &face, "hair": &hair, "outer": &outer, "bottom": &bottom, "footwear": &boots}
		if old["hairstyle"] == "bald" {
			wanted["hair"] = nil
		}
	}
	for _, slot := range avatarCatalogue.Slots {
		if slot.ID == "body" {
			continue
		}
		var first, selected, defaultOption *string
		for _, component := range avatarCatalogue.Components {
			if component.Build != build || component.Slot != slot.ID {
				continue
			}
			id := component.OptionID
			if first == nil {
				first = &id
			}
			if id == slot.DefaultOption {
				defaultOption = &id
			}
			if wanted[slot.ID] != nil && *wanted[slot.ID] == id {
				selected = &id
			}
		}
		if selected == nil && !slot.Optional {
			selected = first
			if defaultOption != nil {
				selected = defaultOption
			}
		}
		out.Parts[slot.ID] = selected
	}
	// Match the client: determine occupied slots from the original selection.
	occupied := []string{}
	for _, component := range avatarCatalogue.Components {
		if id := out.Parts[component.Slot]; component.Build == build && id != nil && *id == component.OptionID {
			for _, slot := range component.Occupies {
				if slot != component.Slot {
					occupied = append(occupied, slot)
				}
			}
		}
	}
	for _, slot := range occupied {
		if _, ok := out.Parts[slot]; ok {
			out.Parts[slot] = nil
		}
	}
	for _, key := range avatarCatalogue.ColorKeys {
		value := a.Colors[key]
		if legacy {
			value = ""
			if key == "outer.primary" {
				value = a.Outfit
			}
			if key == "bottom.primary" {
				value = old["pants"]
			}
		}
		if !avatarHex.MatchString(value) {
			value = avatarCatalogue.DefaultColors[key]
		}
		if avatarHex.MatchString(value) {
			out.Colors[key] = strings.ToLower(value)
		}
	}
	return out
}
