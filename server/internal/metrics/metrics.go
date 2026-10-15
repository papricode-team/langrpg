// Package metrics is a small, dependency-free Prometheus text exposition
// (format 0.0.4) for counters, histograms and scrape-time gauges.
//
// Every labelled family has a hard series limit: once reached, new label
// combinations are folded into a single series whose labels are all
// "overflow", so a bug that feeds unbounded values can never grow memory or
// scrape size without bound.
package metrics

import (
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync"
)

// MaxSeries bounds the number of label combinations per family.
const MaxSeries = 500

// OverflowLabel replaces every label value once a family is full.
const OverflowLabel = "overflow"

// DefaultBuckets matches Prometheus' default latency buckets, in seconds.
var DefaultBuckets = []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10}

// Sample is one value produced by a scrape-time collector.
type Sample struct {
	Labels []string
	Value  float64
}

type family interface {
	name() string
	write(w io.Writer) error
}

// Registry holds metric families and writes them in a stable order.
type Registry struct {
	mu       sync.Mutex
	families []family
	names    map[string]bool
}

func NewRegistry() *Registry { return &Registry{names: map[string]bool{}} }

func (r *Registry) add(f family) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.names[f.name()] {
		panic("metrics: duplicate family " + f.name())
	}
	r.names[f.name()] = true
	r.families = append(r.families, f)
}

// WriteText writes every family in the Prometheus text format.
func (r *Registry) WriteText(w io.Writer) error {
	r.mu.Lock()
	families := append([]family(nil), r.families...)
	r.mu.Unlock()
	sort.Slice(families, func(i, j int) bool { return families[i].name() < families[j].name() })
	for _, f := range families {
		if err := f.write(w); err != nil {
			return err
		}
	}
	return nil
}

// ContentType is the exposition format's media type.
const ContentType = "text/plain; version=0.0.4; charset=utf-8"

type meta struct {
	metricName, help, kind string
	labels                 []string
}

func (m meta) name() string { return m.metricName }

func (m meta) header(w io.Writer) error {
	_, err := fmt.Fprintf(w, "# HELP %s %s\n# TYPE %s %s\n", m.metricName, escapeHelp(m.help), m.metricName, m.kind)
	return err
}

func escapeHelp(s string) string {
	return strings.NewReplacer(`\`, `\\`, "\n", `\n`).Replace(s)
}

func escapeLabel(s string) string {
	return strings.NewReplacer(`\`, `\\`, "\n", `\n`, `"`, `\"`).Replace(s)
}

// labelText renders {a="x",b="y"}; extra appends one more pair (for le).
func labelText(names, values []string, extraName, extraValue string) string {
	if len(names) == 0 && extraName == "" {
		return ""
	}
	var b strings.Builder
	b.WriteByte('{')
	for i, n := range names {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(n)
		b.WriteString(`="`)
		b.WriteString(escapeLabel(values[i]))
		b.WriteByte('"')
	}
	if extraName != "" {
		if len(names) > 0 {
			b.WriteByte(',')
		}
		b.WriteString(extraName)
		b.WriteString(`="`)
		b.WriteString(extraValue)
		b.WriteByte('"')
	}
	b.WriteByte('}')
	return b.String()
}

func formatValue(v float64) string {
	switch {
	case math.IsInf(v, 1):
		return "+Inf"
	case math.IsInf(v, -1):
		return "-Inf"
	case math.IsNaN(v):
		return "NaN"
	}
	return strconv.FormatFloat(v, 'g', -1, 64)
}

// seriesKey joins label values with a separator that cannot appear unescaped.
func seriesKey(values []string) string { return strings.Join(values, "\xff") }

func (m meta) checkValues(values []string) []string {
	if len(values) != len(m.labels) {
		panic(fmt.Sprintf("metrics: %s expects %d label values, got %d", m.metricName, len(m.labels), len(values)))
	}
	return values
}

func overflow(n int) []string {
	values := make([]string, n)
	for i := range values {
		values[i] = OverflowLabel
	}
	return values
}

// CounterVec is a monotonically increasing value per label combination.
type CounterVec struct {
	meta
	mu     sync.Mutex
	series map[string]*counterSeries
}

type counterSeries struct {
	values []string
	value  float64
}

func (r *Registry) Counter(name, help string, labels ...string) *CounterVec {
	c := &CounterVec{meta: meta{name, help, "counter", labels}, series: map[string]*counterSeries{}}
	r.add(c)
	return c
}

func (c *CounterVec) Add(delta float64, values ...string) {
	if delta < 0 {
		return
	}
	c.checkValues(values)
	c.mu.Lock()
	defer c.mu.Unlock()
	key := seriesKey(values)
	s := c.series[key]
	if s == nil {
		if len(c.series) >= MaxSeries {
			values = overflow(len(values))
			key = seriesKey(values)
			s = c.series[key]
		}
		if s == nil {
			s = &counterSeries{values: append([]string(nil), values...)}
			c.series[key] = s
		}
	}
	s.value += delta
}

func (c *CounterVec) Inc(values ...string) { c.Add(1, values...) }

// Value returns one series' current value (for tests and diagnostics).
func (c *CounterVec) Value(values ...string) float64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	if s := c.series[seriesKey(values)]; s != nil {
		return s.value
	}
	return 0
}

// Series reports how many label combinations exist.
func (c *CounterVec) Series() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.series)
}

func sortedKeys[T any](m map[string]T) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func (c *CounterVec) write(w io.Writer) error {
	if err := c.header(w); err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, key := range sortedKeys(c.series) {
		s := c.series[key]
		if _, err := fmt.Fprintf(w, "%s%s %s\n", c.metricName, labelText(c.labels, s.values, "", ""), formatValue(s.value)); err != nil {
			return err
		}
	}
	return nil
}

// HistogramVec counts observations into cumulative buckets per label combination.
type HistogramVec struct {
	meta
	buckets []float64
	mu      sync.Mutex
	series  map[string]*histogramSeries
}

type histogramSeries struct {
	values []string
	counts []uint64 // per bucket, non-cumulative
	count  uint64
	sum    float64
}

func (r *Registry) Histogram(name, help string, buckets []float64, labels ...string) *HistogramVec {
	sorted := append([]float64(nil), buckets...)
	sort.Float64s(sorted)
	h := &HistogramVec{meta: meta{name, help, "histogram", labels}, buckets: sorted, series: map[string]*histogramSeries{}}
	r.add(h)
	return h
}

func (h *HistogramVec) Observe(v float64, values ...string) {
	h.checkValues(values)
	h.mu.Lock()
	defer h.mu.Unlock()
	key := seriesKey(values)
	s := h.series[key]
	if s == nil {
		if len(h.series) >= MaxSeries {
			values = overflow(len(values))
			key = seriesKey(values)
			s = h.series[key]
		}
		if s == nil {
			s = &histogramSeries{values: append([]string(nil), values...), counts: make([]uint64, len(h.buckets))}
			h.series[key] = s
		}
	}
	for i, upper := range h.buckets {
		if v <= upper {
			s.counts[i]++
			break
		}
	}
	s.count++
	s.sum += v
}

// Count returns one series' observation count (for tests and diagnostics).
func (h *HistogramVec) Count(values ...string) uint64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	if s := h.series[seriesKey(values)]; s != nil {
		return s.count
	}
	return 0
}

func (h *HistogramVec) write(w io.Writer) error {
	if err := h.header(w); err != nil {
		return err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, key := range sortedKeys(h.series) {
		s := h.series[key]
		var cumulative uint64
		for i, upper := range h.buckets {
			cumulative += s.counts[i]
			if _, err := fmt.Fprintf(w, "%s_bucket%s %d\n", h.metricName, labelText(h.labels, s.values, "le", formatValue(upper)), cumulative); err != nil {
				return err
			}
		}
		labels := labelText(h.labels, s.values, "", "")
		if _, err := fmt.Fprintf(w, "%s_bucket%s %d\n%s_sum%s %s\n%s_count%s %d\n",
			h.metricName, labelText(h.labels, s.values, "le", "+Inf"), s.count,
			h.metricName, labels, formatValue(s.sum),
			h.metricName, labels, s.count); err != nil {
			return err
		}
	}
	return nil
}

// funcFamily collects gauge or counter samples at scrape time.
type funcFamily struct {
	meta
	collect func() []Sample
}

// GaugeFunc registers a gauge family whose samples are read at scrape time.
func (r *Registry) GaugeFunc(name, help string, labels []string, collect func() []Sample) {
	r.add(&funcFamily{meta{name, help, "gauge", labels}, collect})
}

// CounterFunc registers a counter family read at scrape time from a source
// that is already monotonic (for example connection pool statistics).
func (r *Registry) CounterFunc(name, help string, labels []string, collect func() []Sample) {
	r.add(&funcFamily{meta{name, help, "counter", labels}, collect})
}

func (f *funcFamily) write(w io.Writer) error {
	samples := f.collect()
	if err := f.header(w); err != nil {
		return err
	}
	sort.Slice(samples, func(i, j int) bool { return seriesKey(samples[i].Labels) < seriesKey(samples[j].Labels) })
	if len(samples) > MaxSeries {
		samples = samples[:MaxSeries]
	}
	for _, s := range samples {
		if len(s.Labels) != len(f.labels) {
			return fmt.Errorf("metrics: %s sample has %d labels, want %d", f.metricName, len(s.Labels), len(f.labels))
		}
		if _, err := fmt.Fprintf(w, "%s%s %s\n", f.metricName, labelText(f.labels, s.Labels, "", ""), formatValue(s.Value)); err != nil {
			return err
		}
	}
	return nil
}
