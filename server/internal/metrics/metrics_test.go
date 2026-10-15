package metrics

import (
	"fmt"
	"strings"
	"testing"
)

func TestExpositionFormatAndEscaping(t *testing.T) {
	r := NewRegistry()
	requests := r.Counter("test_requests_total", "Requests.\nSecond line", "route", "method")
	requests.Inc("/api/x", "GET")
	requests.Add(2, `/a"b\c`+"\n", "POST")
	latency := r.Histogram("test_duration_seconds", "Latency.", []float64{0.1, 1}, "route")
	latency.Observe(0.05, "/api/x")
	latency.Observe(0.5, "/api/x")
	latency.Observe(5, "/api/x")
	r.GaugeFunc("test_in_flight", "In flight.", nil, func() []Sample { return []Sample{{Value: 3}} })
	var out strings.Builder
	if err := r.WriteText(&out); err != nil {
		t.Fatal(err)
	}
	text := out.String()
	if err := Validate(text); err != nil {
		t.Fatalf("%v\n%s", err, text)
	}
	for _, want := range []string{
		"# HELP test_requests_total Requests.\\nSecond line\n",
		`test_requests_total{route="/a\"b\\c\n",method="POST"} 2`,
		`test_duration_seconds_bucket{route="/api/x",le="0.1"} 1`,
		`test_duration_seconds_bucket{route="/api/x",le="1"} 2`,
		`test_duration_seconds_bucket{route="/api/x",le="+Inf"} 3`,
		`test_duration_seconds_count{route="/api/x"} 3`,
		"test_in_flight 3\n",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing %q in:\n%s", want, text)
		}
	}
}

func TestSeriesAreBounded(t *testing.T) {
	r := NewRegistry()
	c := r.Counter("bounded_total", "Bounded.", "value")
	h := r.Histogram("bounded_seconds", "Bounded.", DefaultBuckets, "value")
	for i := 0; i < 5*MaxSeries; i++ {
		c.Inc(fmt.Sprint(i))
		h.Observe(1, fmt.Sprint(i))
	}
	if c.Series() != MaxSeries+1 || c.Value(OverflowLabel) != float64(4*MaxSeries) || h.Count(OverflowLabel) != uint64(4*MaxSeries) {
		t.Fatalf("series %d overflow %v", c.Series(), c.Value(OverflowLabel))
	}
}

func TestValidateRejectsMalformedExposition(t *testing.T) {
	for name, text := range map[string]string{
		"no type":          "x_total 1\n",
		"bad value":        "# TYPE x gauge\nx one\n",
		"bad labels":       "# TYPE x gauge\nx{a=b} 1\n",
		"duplicate series": "# TYPE x gauge\nx{a=\"1\"} 1\nx{a=\"1\"} 2\n",
		"inf mismatch":     "# TYPE h histogram\nh_bucket{le=\"1\"} 1\nh_bucket{le=\"+Inf\"} 2\nh_sum 1\nh_count 3\n",
		"decreasing":       "# TYPE h histogram\nh_bucket{le=\"1\"} 2\nh_bucket{le=\"+Inf\"} 1\nh_sum 1\nh_count 1\n",
		"no newline":       "# TYPE x gauge\nx 1",
	} {
		if Validate(text) == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}
