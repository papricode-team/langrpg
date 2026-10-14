package main

import (
	"context"
	"errors"
	"lernen01/server/internal/contentstore"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		client := &http.Client{Timeout: 3 * time.Second}
		response, err := client.Get("http://127.0.0.1:" + env("PORT", "8097") + "/api/health")
		if err != nil {
			os.Exit(1)
		}
		defer response.Body.Close()
		if response.StatusCode != 200 {
			os.Exit(1)
		}
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	var store Store
	var err error
	if url := os.Getenv("DATABASE_URL"); url != "" {
		store, err = NewPGStore(ctx, url)
	} else {
		store, err = NewJSONStore(env("DATA_PATH", ".data/state.json"))
	}
	if err != nil {
		slog.Error("storage initialization failed", "error", err)
		os.Exit(1)
	}
	var catalog *contentstore.Bundle
	if postgres, ok := store.(*PGStore); ok {
		catalog, err = contentstore.LoadPostgres(ctx, postgres.pool)
	} else {
		path := env("CONTENT_PATH", filepath.Join(filepath.Dir(env("DATA_PATH", ".data/state.json")), "content.json"))
		catalog, err = contentstore.LoadJSON(path)
		if errors.Is(err, os.ErrNotExist) && os.Getenv("CONTENT_PATH") == "" {
			catalog, err = contentstore.LoadJSON("content.json")
		}
	}
	cancel()
	if err != nil {
		slog.Error("learning content initialization failed; import the generated content bundle", "error", err)
		store.Close()
		os.Exit(1)
	}
	maxPlayers, err := strconv.Atoi(env("MAX_ZONE_PLAYERS", "128"))
	if err != nil || maxPlayers < 2 || maxPlayers > 1000 {
		slog.Error("MAX_ZONE_PLAYERS must be between 2 and 1000")
		store.Close()
		os.Exit(1)
	}
	app := NewApp(store, Curriculum{}, strings.Split(env("ALLOWED_ORIGINS", "http://localhost:5187,http://127.0.0.1:5187,http://127.240.77.9:5187,http://localhost:8097"), ","), maxPlayers)
	if err = app.InstallContent(catalog); err != nil {
		slog.Error("invalid course content", "error", err)
		app.Close()
		os.Exit(1)
	}
	if env("MIGRATE_CONTENT_UUIDS", "false") == "true" {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		err = app.canonical.Migrate(ctx)
		cancel()
		if err != nil {
			slog.Error("content UUID migration failed", "error", err)
			app.Close()
			os.Exit(1)
		}
	}
	app.installProductionManifests()
	defer app.Close()
	app.billing, err = creemBillingFromEnv()
	if err != nil {
		slog.Error("billing configuration is invalid", "error", err)
		os.Exit(1)
	}
	if directory := os.Getenv("STATIC_DIR"); directory != "" {
		app.frontend, err = newFrontendHandler(directory)
		if err != nil {
			slog.Error("frontend initialization failed", "error", err)
			os.Exit(1)
		}
		app.version, err = loadDeploymentVersion(directory)
		if err != nil {
			slog.Warn("frontend version metadata is unavailable", "error", err)
		}
	}
	server := &http.Server{Addr: ":" + env("PORT", "8097"), Handler: app.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	stopped := make(chan os.Signal, 1)
	shutdownDone := make(chan struct{})
	signal.Notify(stopped, os.Interrupt, syscall.SIGTERM)
	go func() {
		defer close(shutdownDone)
		<-stopped
		app.world.Close()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	slog.Info("language world listening", "port", env("PORT", "8097"), "storage", store.Kind(), "courses", len(catalog.Courses), "quests", len(app.curriculum.Quests), "items", len(app.curriculum.Items))
	if store.Kind() == "json-development" {
		slog.Warn("JSON development persistence is single-process; configure DATABASE_URL for production")
	}
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("HTTP server failed", "error", err)
		return
	}
	<-shutdownDone
}
