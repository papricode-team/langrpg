package main

import (
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
)

// The public directory contains only the compiled public website and game,
// never server data. Only /game/ has an SPA fallback; unknown public pages are
// real 404s so crawlers cannot index a game shell as thousands of empty pages.
func newFrontendHandler(directory string) (http.Handler, error) {
	public := os.DirFS(directory)
	if _, err := fs.ReadFile(public, "index.html"); err != nil {
		return nil, fmt.Errorf("read frontend index: %w", err)
	}
	notFound := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Robots-Tag", "noindex, follow")
		if page, err := fs.ReadFile(public, "404.html"); err == nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusNotFound)
			if r.Method != http.MethodHead {
				_, _ = w.Write(page)
			}
			return
		}
		http.NotFound(w, r)
	}
	redirect := func(w http.ResponseWriter, r *http.Request, destination string, status int) {
		if r.URL.RawQuery != "" {
			destination += "?" + r.URL.RawQuery
		}
		http.Redirect(w, r, destination, status)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		name := strings.TrimPrefix(r.URL.Path, "/")
		// Previously shared invite URLs and in-flight checkout returns must
		// still open the game and retain their query parameters.
		if (name == "" || name == "index.html") && (r.URL.Query().Has("ref") || r.URL.Query().Has("billing")) {
			w.Header().Set("Cache-Control", "no-store")
			redirect(w, r, "/game/", http.StatusTemporaryRedirect)
			return
		}
		if name != "" && (!fs.ValidPath(strings.TrimSuffix(name, "/")) || strings.HasPrefix(name, ".") || strings.Contains(name, "/.")) {
			notFound(w, r)
			return
		}
		if name == "index.html" || strings.HasSuffix(name, "/index.html") {
			redirect(w, r, "/"+strings.TrimSuffix(name, "index.html"), http.StatusPermanentRedirect)
			return
		}
		gameRoute := name == "game" || strings.HasPrefix(name, "game/")
		if gameRoute || name == "admin.html" || name == "reset-password.html" {
			w.Header().Set("X-Robots-Tag", "noindex, follow")
		}
		if name == "" {
			name = "index.html"
		} else {
			// Resolve only authored directory pages; never list directories.
			page := strings.TrimSuffix(name, "/") + "/index.html"
			if info, err := fs.Stat(public, page); err == nil && info.Mode().IsRegular() {
				if !strings.HasSuffix(r.URL.Path, "/") {
					redirect(w, r, r.URL.Path+"/", http.StatusPermanentRedirect)
					return
				}
				name = page
			} else if gameRoute && path.Ext(name) == "" {
				name = "game/index.html"
			}
		}
		info, err := fs.Stat(public, name)
		if err != nil || !info.Mode().IsRegular() {
			notFound(w, r)
			return
		}
		if contentType := mime.TypeByExtension(path.Ext(name)); contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
		// Public HTML, sitemaps and named artwork are replaced in place.
		// Only fingerprinted Astro assets are immutable across deployments.
		switch {
		case strings.HasPrefix(name, "_astro/"):
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		case path.Ext(name) == ".html", path.Ext(name) == ".xml", name == "robots.txt", strings.HasPrefix(name, "images/"),
			strings.HasPrefix(name, "assets/") && (path.Ext(name) == ".webp" || path.Ext(name) == ".json"):
			w.Header().Set("Cache-Control", "no-cache")
		default:
			w.Header().Set("Cache-Control", "public, max-age=604800")
		}
		w.Header().Add("Vary", "Accept-Encoding")
		if acceptsGzip(r.Header.Get("Accept-Encoding")) {
			if compressed, err := fs.Stat(public, name+".gz"); err == nil && compressed.Mode().IsRegular() {
				name += ".gz"
				info = compressed
				w.Header().Set("Content-Encoding", "gzip")
			}
		}
		file, err := public.Open(name)
		if err != nil {
			notFound(w, r)
			return
		}
		defer file.Close()
		http.ServeContent(w, r, name, info.ModTime(), file.(io.ReadSeeker))
	}), nil
}

func acceptsGzip(value string) bool {
	for _, encoding := range strings.Split(value, ",") {
		parts := strings.Split(strings.TrimSpace(encoding), ";")
		if parts[0] != "gzip" {
			continue
		}
		for _, parameter := range parts[1:] {
			key, value, found := strings.Cut(strings.TrimSpace(parameter), "=")
			if found && key == "q" {
				quality, err := strconv.ParseFloat(value, 64)
				return err == nil && quality > 0 && quality <= 1
			}
		}
		return true
	}
	return false
}
