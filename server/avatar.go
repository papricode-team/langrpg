package main

import (
	"slices"
	"strings"
)

// Optional parts keep existing saved avatars compatible. Every new piece is allowlisted.
func validAvatar(a Avatar) bool {
	if !paletteValue.MatchString(a.Hair) || !paletteValue.MatchString(a.Skin) || !paletteValue.MatchString(a.Outfit) {
		return false
	}
	if a.Pants != "" && !paletteValue.MatchString(a.Pants) {
		return false
	}
	for _, pair := range [][2]string{
		{a.Face, "oval square angular round long almond mature bearded"},
		{a.Hairstyle, "bald crop bob waves locs braids afro coils pixie ponytail hijab turban silver elder straight bun buzz"},
		{a.Jacket, "travel bomber blazer vest tunic denim"},
		{a.Bottom, "straight wide"}, {a.Build, "slender regular broad full"},
	} {
		if pair[0] != "" && !slices.Contains(strings.Fields(pair[1]), pair[0]) {
			return false
		}
	}
	return true
}
