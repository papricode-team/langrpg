package metrics

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

var (
	sampleLine = regexp.MustCompile(`^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{(.*)\})? (\S+)$`)
	labelPair  = regexp.MustCompile(`^([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\\n]|\\[\\"n])*)"`)
	metricName = regexp.MustCompile(`^[a-zA-Z_:][a-zA-Z0-9_:]*$`)
)

func parseLabels(text string) (map[string]string, error) {
	labels := map[string]string{}
	for text != "" {
		match := labelPair.FindStringSubmatch(text)
		if match == nil {
			return nil, fmt.Errorf("malformed labels %q", text)
		}
		if _, dup := labels[match[1]]; dup {
			return nil, fmt.Errorf("duplicate label %s", match[1])
		}
		labels[match[1]] = match[2]
		text = strings.TrimPrefix(text[len(match[0]):], ",")
	}
	return labels, nil
}

// Validate checks text against the exposition rules this package relies on:
// well-formed lines, one HELP/TYPE per family before its samples, no
// duplicate series, numeric values, and consistent histograms. It is used by
// tests of anything that serves metrics.
func Validate(text string) error {
	types := map[string]string{}
	helps := map[string]bool{}
	seen := map[string]bool{}
	type histogram struct {
		last     float64
		inf      float64
		count    float64
		hasInf   bool
		hasCount bool
	}
	histograms := map[string]*histogram{}
	if text != "" && !strings.HasSuffix(text, "\n") {
		return fmt.Errorf("exposition must end with a newline")
	}
	for number, line := range strings.Split(strings.TrimSuffix(text, "\n"), "\n") {
		fail := func(format string, args ...any) error {
			return fmt.Errorf("line %d %q: %s", number+1, line, fmt.Sprintf(format, args...))
		}
		if strings.HasPrefix(line, "# HELP ") || strings.HasPrefix(line, "# TYPE ") {
			fields := strings.SplitN(line[7:], " ", 2)
			if len(fields) != 2 || !metricName.MatchString(fields[0]) {
				return fail("malformed comment")
			}
			if strings.HasPrefix(line, "# HELP ") {
				if helps[fields[0]] {
					return fail("duplicate HELP")
				}
				helps[fields[0]] = true
				continue
			}
			if _, dup := types[fields[0]]; dup {
				return fail("duplicate TYPE")
			}
			switch fields[1] {
			case "counter", "gauge", "histogram", "summary", "untyped":
			default:
				return fail("unknown type")
			}
			types[fields[0]] = fields[1]
			continue
		}
		if strings.HasPrefix(line, "#") || line == "" {
			return fail("unexpected line")
		}
		match := sampleLine.FindStringSubmatch(line)
		if match == nil {
			return fail("malformed sample")
		}
		name, value := match[1], match[4]
		number, err := strconv.ParseFloat(value, 64)
		if err != nil && value != "+Inf" && value != "-Inf" && value != "NaN" {
			return fail("non-numeric value")
		}
		labels, err := parseLabels(match[3])
		if err != nil {
			return fail("%v", err)
		}
		familyName, suffix := name, ""
		for _, candidate := range []string{"_bucket", "_sum", "_count"} {
			if base := strings.TrimSuffix(name, candidate); base != name && types[base] == "histogram" {
				familyName, suffix = base, candidate
			}
		}
		kind, declared := types[familyName]
		if !declared {
			return fail("sample before its TYPE")
		}
		if kind == "counter" && number < 0 {
			return fail("negative counter")
		}
		if seen[line[:len(line)-len(value)]] {
			return fail("duplicate series")
		}
		seen[line[:len(line)-len(value)]] = true
		if kind != "histogram" {
			continue
		}
		le, hasLE := labels["le"]
		delete(labels, "le")
		key := familyName + fmt.Sprint(sortedLabelPairs(labels))
		h := histograms[key]
		if h == nil {
			h = &histogram{}
			histograms[key] = h
		}
		switch suffix {
		case "_bucket":
			if !hasLE {
				return fail("bucket without le")
			}
			if number < h.last {
				return fail("cumulative buckets must not decrease")
			}
			h.last = number
			if le == "+Inf" {
				h.inf, h.hasInf = number, true
			}
		case "_count":
			h.count, h.hasCount = number, true
		case "_sum":
		default:
			return fail("histogram sample without suffix")
		}
	}
	for key, h := range histograms {
		if !h.hasInf || !h.hasCount || h.inf != h.count {
			return fmt.Errorf("histogram %s: +Inf bucket must equal _count", key)
		}
	}
	return nil
}

func sortedLabelPairs(labels map[string]string) []string {
	var pairs []string
	for _, k := range sortedKeys(labels) {
		pairs = append(pairs, k+"="+labels[k])
	}
	return pairs
}
