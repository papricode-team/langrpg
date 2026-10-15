package main

import (
	"bufio"
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"regexp"
	"time"
)

var requestIDPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,64}$`)

type requestIDKey struct{}

// statusRecorder captures the response status and size for the access log.
// Unwrap and Hijack keep websocket upgrades and http.ResponseController working.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int64
}

func (w *statusRecorder) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusRecorder) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(data)
	w.bytes += int64(n)
	return n, err
}

func (w *statusRecorder) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *statusRecorder) Flush() {
	if flusher, ok := w.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (w *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := w.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("response writer does not support hijacking")
	}
	conn, rw, err := hijacker.Hijack()
	if err == nil && w.status == 0 {
		w.status = http.StatusSwitchingProtocols
	}
	return conn, rw, err
}

// accessLog records one line per request: method, path, status, duration,
// size and a request ID. It never logs the query string (the world socket
// carries its session token there) or any request header such as
// Authorization. A valid inbound X-Request-ID is echoed; otherwise one is
// generated.
func (a *App) accessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		id := r.Header.Get("X-Request-ID")
		if !requestIDPattern.MatchString(id) {
			id, _ = randomID(12)
		}
		w.Header().Set("X-Request-ID", id)
		recorder := &statusRecorder{ResponseWriter: w}
		r = r.WithContext(context.WithValue(r.Context(), requestIDKey{}, id))
		next.ServeHTTP(recorder, r)
		status := recorder.status
		if status == 0 {
			status = http.StatusOK
		}
		// Container health probes would otherwise dominate the log.
		if (r.URL.Path == "/api/live" || r.URL.Path == "/api/health") && status < 400 {
			return
		}
		path := r.URL.Path
		if len(path) > 256 {
			path = path[:256] + "…"
		}
		slog.Info("http request", "requestId", id, "method", r.Method, "path", path, "status", status, "durationMs", time.Since(started).Milliseconds(), "bytes", recorder.bytes)
	})
}
