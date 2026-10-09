package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

// Read the build ID once so a process restart keeps the deployed version and
// version checks do not depend on storage or changes to files while serving.
func loadDeploymentVersion(directory string) (string, error) {
	if directory == "" {
		return "", nil
	}
	file, err := os.Open(filepath.Join(directory, "version.json"))
	if errors.Is(err, os.ErrNotExist) {
		// API-only development and older frontend builds have no version metadata.
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("read frontend version: %w", err)
	}
	defer file.Close()
	const maxMetadataSize = 4096
	data, err := io.ReadAll(io.LimitReader(file, maxMetadataSize+1))
	if err != nil {
		return "", fmt.Errorf("read frontend version: %w", err)
	}
	if len(data) > maxMetadataSize {
		return "", errors.New("frontend version metadata exceeds 4 KiB")
	}
	var metadata struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(data, &metadata); err != nil {
		return "", fmt.Errorf("parse frontend version: %w", err)
	}
	if !safeID.MatchString(metadata.Version) {
		return "", errors.New("frontend version must be a valid build ID")
	}
	return metadata.Version, nil
}

func (a *App) deploymentVersion(w http.ResponseWriter, r *http.Request) {
	if a.version == "" {
		writeError(w, http.StatusServiceUnavailable, "deployment version is unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"version": a.version})
}
