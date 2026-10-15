package main

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"strings"
)

// A world published before a story update lacks the new characters, evidence and
// story rules. Reconciliation adds every missing canonical anchor (keeping the
// admin's own placements) and recompiles story positions from the result, so a
// release never strands players on a scene the saved world does not know.

type sceneAnchor struct {
	ID string  `json:"id"`
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
}

type sceneAnchors struct {
	Width   float64       `json:"width"`
	Height  float64       `json:"height"`
	NPCs    []sceneAnchor `json:"npcs"`
	Objects []sceneAnchor `json:"objects"`
	Scenery []sceneAnchor `json:"scenery"`
}

func anchorAt(scene sceneAnchors, anchor string) (MapSpawn, bool) {
	kind, id, ok := strings.Cut(anchor, ":")
	if !ok || scene.Width <= 0 || scene.Height <= 0 {
		return MapSpawn{}, false
	}
	var rows []sceneAnchor
	switch kind {
	case "npc":
		rows = scene.NPCs
	case "object":
		rows = scene.Objects
	case "scenery":
		rows = scene.Scenery
	default:
		return MapSpawn{}, false
	}
	for _, row := range rows {
		if row.ID == id {
			return MapSpawn{X: row.X / scene.Width, Y: row.Y / scene.Height}, true
		}
	}
	return MapSpawn{}, false
}

// mergeSceneAnchors appends canonical NPCs and objects missing from a saved map.
func mergeSceneAnchors(saved, canonical json.RawMessage) (json.RawMessage, bool, error) {
	var savedDoc, canonicalDoc map[string]any
	if err := json.Unmarshal(saved, &savedDoc); err != nil {
		return nil, false, err
	}
	if err := json.Unmarshal(canonical, &canonicalDoc); err != nil {
		return nil, false, err
	}
	savedMaps, _ := savedDoc["maps"].(map[string]any)
	canonicalMaps, _ := canonicalDoc["maps"].(map[string]any)
	changed := false
	for id, value := range canonicalMaps {
		canonicalScene, _ := value.(map[string]any)
		savedScene, ok := savedMaps[id].(map[string]any)
		if !ok || canonicalScene == nil {
			continue
		}
		for _, key := range []string{"npcs", "objects"} {
			existing := map[string]bool{}
			rows, _ := savedScene[key].([]any)
			for _, row := range rows {
				if item, ok := row.(map[string]any); ok {
					if rowID, ok := item["id"].(string); ok {
						existing[rowID] = true
					}
				}
			}
			additions, _ := canonicalScene[key].([]any)
			for _, row := range additions {
				item, ok := row.(map[string]any)
				if !ok {
					continue
				}
				if rowID, ok := item["id"].(string); ok && !existing[rowID] {
					rows = append(rows, item)
					changed = true
				}
			}
			savedScene[key] = rows
		}
	}
	if !changed {
		return saved, false, nil
	}
	encoded, err := json.Marshal(savedDoc)
	return encoded, true, err
}

type storyAuthority struct {
	Rules      []StoryRule `json:"rules"`
	Ink        InkRegistry `json:"ink"`
	SideQuests []SideQuest `json:"sideQuests"`
}

// compileStoryAuthority mirrors scripts/scene-compiler.mjs compileStoryRules.
func compileStoryAuthority(document json.RawMessage, authored []byte) (storyAuthority, error) {
	var result storyAuthority
	if err := json.Unmarshal(authored, &result); err != nil {
		return result, err
	}
	var doc struct {
		Maps map[string]sceneAnchors `json:"maps"`
	}
	if err := json.Unmarshal(document, &doc); err != nil {
		return result, err
	}
	for i, rule := range result.Rules {
		scene, ok := doc.Maps[rule.MapID]
		if !ok {
			continue
		}
		if position, ok := anchorAt(scene, "npc:"+rule.NPCID); ok {
			result.Rules[i].NPC = position
		}
		objects := []StoryObject{}
		for _, id := range rule.InvestigationObjectIDs {
			object := StoryObject{ID: id}
			for _, authoredObject := range rule.Objects {
				if authoredObject.ID == id {
					object = authoredObject
				}
			}
			if position, ok := anchorAt(scene, "object:"+id); ok {
				object.X, object.Y = position.X, position.Y
			}
			objects = append(objects, object)
		}
		result.Rules[i].Objects = objects
	}
	for i, entry := range result.Ink.Entries {
		if scene, ok := doc.Maps[entry.MapID]; ok {
			if position, ok := anchorAt(scene, entry.Anchor); ok {
				result.Ink.Entries[i].X, result.Ink.Entries[i].Y = position.X, position.Y
			}
		}
	}
	for i, side := range result.SideQuests {
		if scene, ok := doc.Maps[side.MapID]; ok {
			if position, ok := anchorAt(scene, side.Anchor); ok {
				result.SideQuests[i].X, result.SideQuests[i].Y = position.X, position.Y
			}
		}
	}
	return result, nil
}

// reconcileWorldContent returns an updated copy when the release added anchors
// or story authority the saved publication does not yet carry.
func reconcileWorldContent(saved *WorldContent, canonical json.RawMessage, authored []byte) (*WorldContent, bool, error) {
	if saved == nil || len(canonical) == 0 || len(authored) == 0 {
		return saved, false, nil
	}
	document, documentChanged, err := mergeSceneAnchors(saved.Document, canonical)
	if err != nil {
		return saved, false, err
	}
	authority, err := compileStoryAuthority(document, authored)
	if err != nil {
		return saved, false, err
	}
	before, _ := json.Marshal(saved.Investigations)
	after, _ := json.Marshal(authority)
	if !documentChanged && bytes.Equal(before, after) {
		return saved, false, nil
	}
	next := *saved
	next.Document = document
	next.Investigations.Rules = authority.Rules
	next.Investigations.Ink = authority.Ink
	next.Investigations.SideQuests = authority.SideQuests
	if documentChanged {
		next.Revision = worldRevision(document)
		if len(next.Revision) < 16 {
			return saved, false, nil
		}
		next.ContentVersion = next.Revision[:16]
		next.WorldMaps.ContentVersion = next.ContentVersion
	}
	if next.Diagnostics == nil {
		next.Diagnostics = []string{}
	}
	return &next, true, nil
}

// reconcileStoredWorld persists the reconciled publication once; every server
// instance then reads the same revision.
func (a *App) reconcileStoredWorld(ctx context.Context, saved *WorldContent, source string) *WorldContent {
	canonical, err := os.ReadFile(source)
	if err != nil {
		return saved
	}
	authored, err := curriculumFiles.ReadFile("story_rules.json")
	if err != nil {
		return saved
	}
	next, changed, err := reconcileWorldContent(saved, canonical, authored)
	if err != nil || !changed || validateWorldContent(next) != nil {
		return saved
	}
	if storage, ok := a.store.(worldContentStore); ok {
		_ = storage.SaveWorldContent(ctx, saved.Revision, next)
	}
	return next
}
