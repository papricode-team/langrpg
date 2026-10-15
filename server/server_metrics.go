package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"fmt"
	"math"
	"net/http"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"glotworld/server/internal/billing"
	"glotworld/server/internal/metrics"
	"glotworld/server/internal/store"

	"github.com/jackc/pgx/v5/pgxpool"
)

// serverMetrics is the server's Prometheus instrument set. Every label is
// drawn from a bounded set: registered route patterns, a fixed method list,
// status classes, limiter names from code, map IDs and Creem operations.
type serverMetrics struct {
	registry      *metrics.Registry
	requests      *metrics.CounterVec
	duration      *metrics.HistogramVec
	inFlight      atomic.Int64
	limited       *metrics.CounterVec
	creemRequests *metrics.CounterVec
	creemDuration *metrics.HistogramVec
	contentLoad   atomic.Uint64 // float64 bits, seconds
	started       time.Time

	importMu      sync.Mutex
	importAt      time.Time
	importCached  store.ContentImportInfo
	importChecked bool
}

func newServerMetrics(a *App, storage Store) *serverMetrics {
	r := metrics.NewRegistry()
	m := &serverMetrics{registry: r, started: time.Now()}
	m.requests = r.Counter("glotworld_http_requests_total", "HTTP requests by route pattern, method and status class.", "route", "method", "status")
	m.duration = r.Histogram("glotworld_http_request_duration_seconds", "HTTP request latency by route pattern, method and status class. WebSocket upgrades are excluded.", metrics.DefaultBuckets, "route", "method", "status")
	m.limited = r.Counter("glotworld_rate_limit_rejections_total", "Requests rejected by a rate limiter.", "limiter")
	m.creemRequests = r.Counter("glotworld_creem_requests_total", "Creem API calls by operation and outcome.", "operation", "outcome")
	m.creemDuration = r.Histogram("glotworld_creem_request_duration_seconds", "Creem API call latency by operation.", metrics.DefaultBuckets, "operation")
	r.GaugeFunc("glotworld_http_requests_in_flight", "HTTP requests currently being served, including open WebSockets.", nil, func() []metrics.Sample {
		return []metrics.Sample{{Value: float64(m.inFlight.Load())}}
	})
	r.GaugeFunc("glotworld_rate_limit_keys", "Rate-limiter windows currently held in memory.", nil, func() []metrics.Sample {
		a.rateMu.Lock()
		defer a.rateMu.Unlock()
		return []metrics.Sample{{Value: float64(len(a.limits))}}
	})
	r.GaugeFunc("glotworld_world_connections", "Connected world WebSockets per map.", []string{"map"}, func() []metrics.Sample {
		var samples []metrics.Sample
		for mapID, count := range a.world.MapCounts() {
			samples = append(samples, metrics.Sample{Labels: []string{mapID}, Value: float64(count)})
		}
		return samples
	})
	r.GaugeFunc("glotworld_content_load_duration_seconds", "Time this process spent loading and installing the content catalog at startup.", nil, func() []metrics.Sample {
		return []metrics.Sample{{Value: math.Float64frombits(m.contentLoad.Load())}}
	})
	r.GaugeFunc("glotworld_goroutines", "Goroutines in this process.", nil, func() []metrics.Sample {
		return []metrics.Sample{{Value: float64(runtime.NumGoroutine())}}
	})
	r.GaugeFunc("glotworld_start_time_seconds", "Process start time as a Unix timestamp.", nil, func() []metrics.Sample {
		return []metrics.Sample{{Value: float64(m.started.UnixNano()) / 1e9}}
	})
	if reader, ok := storage.(store.ContentImportReader); ok {
		r.GaugeFunc("glotworld_content_import_duration_seconds", "Duration of the last content import recorded by cmd/import-content.", nil, func() []metrics.Sample {
			if info := m.contentImport(reader); info.Known {
				return []metrics.Sample{{Value: info.Duration.Seconds()}}
			}
			return nil
		})
		r.GaugeFunc("glotworld_content_import_timestamp_seconds", "Unix time of the last content import recorded by cmd/import-content.", nil, func() []metrics.Sample {
			if info := m.contentImport(reader); info.Known {
				return []metrics.Sample{{Value: float64(info.At.UnixNano()) / 1e9}}
			}
			return nil
		})
	}
	if pool, ok := storage.(store.PoolStatter); ok {
		gauge := func(name, help string, value func(*pgxpool.Stat) float64) {
			r.GaugeFunc(name, help, nil, func() []metrics.Sample { return []metrics.Sample{{Value: value(pool.PoolStat())}} })
		}
		counter := func(name, help string, value func(*pgxpool.Stat) float64) {
			r.CounterFunc(name, help, nil, func() []metrics.Sample { return []metrics.Sample{{Value: value(pool.PoolStat())}} })
		}
		gauge("glotworld_pgxpool_acquired_conns", "Connections currently checked out of the pool.", func(s *pgxpool.Stat) float64 { return float64(s.AcquiredConns()) })
		gauge("glotworld_pgxpool_idle_conns", "Idle pooled connections.", func(s *pgxpool.Stat) float64 { return float64(s.IdleConns()) })
		gauge("glotworld_pgxpool_total_conns", "Open pooled connections.", func(s *pgxpool.Stat) float64 { return float64(s.TotalConns()) })
		gauge("glotworld_pgxpool_constructing_conns", "Connections being opened.", func(s *pgxpool.Stat) float64 { return float64(s.ConstructingConns()) })
		gauge("glotworld_pgxpool_max_conns", "Configured pool size.", func(s *pgxpool.Stat) float64 { return float64(s.MaxConns()) })
		counter("glotworld_pgxpool_acquires_total", "Successful connection acquisitions.", func(s *pgxpool.Stat) float64 { return float64(s.AcquireCount()) })
		counter("glotworld_pgxpool_acquire_duration_seconds_total", "Total time spent waiting for connections.", func(s *pgxpool.Stat) float64 { return s.AcquireDuration().Seconds() })
		counter("glotworld_pgxpool_empty_acquires_total", "Acquisitions that had to wait for a connection.", func(s *pgxpool.Stat) float64 { return float64(s.EmptyAcquireCount()) })
		counter("glotworld_pgxpool_canceled_acquires_total", "Acquisitions canceled by their context.", func(s *pgxpool.Stat) float64 { return float64(s.CanceledAcquireCount()) })
		counter("glotworld_pgxpool_new_conns_total", "Connections opened.", func(s *pgxpool.Stat) float64 { return float64(s.NewConnsCount()) })
	}
	return m
}

// contentImport caches the database read for 30 s so frequent scrapes do not
// query storage; a failed read leaves the import series out of the scrape.
func (m *serverMetrics) contentImport(reader store.ContentImportReader) store.ContentImportInfo {
	m.importMu.Lock()
	defer m.importMu.Unlock()
	if m.importChecked && time.Since(m.importAt) < 30*time.Second {
		return m.importCached
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	info, err := reader.ContentImportInfo(ctx)
	if err != nil {
		info = store.ContentImportInfo{}
	}
	m.importCached, m.importAt, m.importChecked = info, time.Now(), true
	return info
}

func (m *serverMetrics) setContentLoad(d time.Duration) {
	m.contentLoad.Store(math.Float64bits(d.Seconds()))
}

var knownMethods = map[string]bool{"GET": true, "HEAD": true, "POST": true, "PUT": true, "PATCH": true, "DELETE": true, "OPTIONS": true}

func methodLabel(method string) string {
	if knownMethods[method] {
		return method
	}
	return "OTHER"
}

// routeLabel is the registered ServeMux pattern without its method, e.g.
// "/api/admin/users/{id}". Requests answered before routing (rejected origins,
// access walls) have no pattern and share "unrouted".
func routeLabel(pattern string) string {
	if pattern == "" {
		return "unrouted"
	}
	if _, path, found := strings.Cut(pattern, " "); found {
		return path
	}
	return pattern
}

func statusClass(status int) string {
	if status < 100 || status > 599 {
		return "other"
	}
	return fmt.Sprintf("%dxx", status/100)
}

func (m *serverMetrics) observeRequest(r *http.Request, status int, elapsed time.Duration) {
	route, method, class := routeLabel(r.Pattern), methodLabel(r.Method), statusClass(status)
	m.requests.Inc(route, method, class)
	// An upgraded WebSocket lasts as long as the connection; it would swamp
	// the latency distribution of ordinary requests.
	if status != http.StatusSwitchingProtocols {
		m.duration.Observe(elapsed.Seconds(), route, method, class)
	}
}

// limiterName is the fixed prefix of a limiter key ("login:203.0.113.7" → "login").
func limiterName(key string) string {
	name, _, _ := strings.Cut(key, ":")
	return name
}

// observeCreem is installed on the Creem client; operation is already a
// path pattern without IDs or query strings.
func (m *serverMetrics) observeCreem(operation string, elapsed time.Duration, err error) {
	outcome := "ok"
	var status *billing.HTTPError
	switch {
	case errors.As(err, &status):
		outcome = fmt.Sprintf("http_%dxx", status.Status/100)
	case err != nil:
		outcome = "error"
	}
	m.creemRequests.Inc(operation, outcome)
	m.creemDuration.Observe(elapsed.Seconds(), operation)
}

func tokensEqual(provided, expected string) bool {
	left, right := sha256.Sum256([]byte(provided)), sha256.Sum256([]byte(expected))
	return subtle.ConstantTimeCompare(left[:], right[:]) == 1
}

// parseMetricsToken validates METRICS_TOKEN. Empty disables /metrics.
func parseMetricsToken(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value != "" && (len(value) < 16 || strings.ContainsAny(value, " \t\r\n")) {
		return "", errors.New("METRICS_TOKEN must be at least 16 characters without whitespace, or empty to disable /metrics")
	}
	return value, nil
}

// metricsEndpoint serves the exposition to scrapers holding METRICS_TOKEN.
// Without a configured token the endpoint does not exist (404).
func (a *App) metricsEndpoint(w http.ResponseWriter, r *http.Request) {
	if a.metricsToken == "" {
		writeError(w, 404, "endpoint not found")
		return
	}
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") || !tokensEqual(strings.TrimPrefix(header, "Bearer "), a.metricsToken) {
		w.Header().Set("WWW-Authenticate", `Bearer realm="metrics"`)
		writeError(w, 401, "a metrics token is required")
		return
	}
	w.Header().Set("Content-Type", metrics.ContentType)
	w.WriteHeader(200)
	_ = a.metrics.registry.WriteText(w)
}
