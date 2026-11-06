package main

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type InstantAnswer struct {
	Type        string `json:"type"`        // "calculator", "converter", "definition", "fact"
	Title       string `json:"title"`       // e.g. "15 × 4 = 60"
	Subtitle    string `json:"subtitle"`    // e.g. "Calculation"
	Description string `json:"description"` // Optional details
	Badge       string `json:"badge"`       // "Instant Answer"
}

var (
	mathSimpleRegex  = regexp.MustCompile(`^\s*(-?\d+(?:\.\d+)?)\s*([\+\-\*\/xX\^])\s*(-?\d+(?:\.\d+)?)\s*$`)
	sqrtRegex        = regexp.MustCompile(`(?i)^\s*sqrt\s*\(\s*(\d+(?:\.\d+)?)\s*\)\s*$`)
	percentOfRegex   = regexp.MustCompile(`(?i)^\s*(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)\s*$`)
	unitConvertRegex = regexp.MustCompile(`(?i)^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s+(?:in|to)\s+([a-zA-Z]+)\s*$`)
)

func ResolveInstantAnswer(query string) *InstantAnswer {
	q := strings.TrimSpace(query)
	qLower := strings.ToLower(q)

	// 1. Math: Percentage of number (e.g. "15% of 800")
	if m := percentOfRegex.FindStringSubmatch(q); len(m) == 3 {
		pct, _ := strconv.ParseFloat(m[1], 64)
		base, _ := strconv.ParseFloat(m[2], 64)
		result := (pct / 100.0) * base
		return &InstantAnswer{
			Type:        "calculator",
			Title:       fmt.Sprintf("%g%% of %g = %g", pct, base, result),
			Subtitle:    "Percentage Calculation",
			Description: fmt.Sprintf("(%g ÷ 100) × %g = %g", pct, base, result),
			Badge:       "Calculator",
		}
	}

	// 2. Math: Sqrt (e.g. "sqrt(144)")
	if m := sqrtRegex.FindStringSubmatch(q); len(m) == 2 {
		val, _ := strconv.ParseFloat(m[1], 64)
		if val >= 0 {
			res := math.Sqrt(val)
			return &InstantAnswer{
				Type:        "calculator",
				Title:       fmt.Sprintf("√%g = %g", val, res),
				Subtitle:    "Square Root",
				Description: fmt.Sprintf("The principal square root of %g is %g", val, res),
				Badge:       "Calculator",
			}
		}
	}

	// 3. Math: Simple 2-operand arithmetic (e.g. "25 * 4", "100 / 4", "2^8")
	if m := mathSimpleRegex.FindStringSubmatch(q); len(m) == 4 {
		v1, err1 := strconv.ParseFloat(m[1], 64)
		op := m[2]
		v2, err2 := strconv.ParseFloat(m[3], 64)

		if err1 == nil && err2 == nil {
			var result float64
			var opSymbol string
			valid := true

			switch op {
			case "+":
				result = v1 + v2
				opSymbol = "+"
			case "-":
				result = v1 - v2
				opSymbol = "-"
			case "*", "x", "X":
				result = v1 * v2
				opSymbol = "×"
			case "/":
				if v2 == 0 {
					return &InstantAnswer{
						Type:     "calculator",
						Title:    "Cannot divide by zero",
						Subtitle: "Arithmetic Error",
						Badge:    "Calculator",
					}
				}
				result = v1 / v2
				opSymbol = "÷"
			case "^":
				result = math.Pow(v1, v2)
				opSymbol = "^"
			default:
				valid = false
			}

			if valid {
				return &InstantAnswer{
					Type:     "calculator",
					Title:    fmt.Sprintf("%g %s %g = %g", v1, opSymbol, v2, result),
					Subtitle: "Calculation",
					Badge:    "Calculator",
				}
			}
		}
	}

	// 4. Unit Conversions (e.g. "10 km to miles", "100 c to f", "50 kg to lbs")
	if m := unitConvertRegex.FindStringSubmatch(q); len(m) == 4 {
		val, _ := strconv.ParseFloat(m[1], 64)
		fromUnit := strings.ToLower(m[2])
		toUnit := strings.ToLower(m[3])

		converted, unitLabel, ok := convertUnits(val, fromUnit, toUnit)
		if ok {
			return &InstantAnswer{
				Type:        "converter",
				Title:       fmt.Sprintf("%g %s = %.4g %s", val, fromUnit, converted, unitLabel),
				Subtitle:    "Unit Conversion",
				Description: fmt.Sprintf("Standard conversion between %s and %s", fromUnit, toUnit),
				Badge:       "Unit Converter",
			}
		}
	}

	// 5. Time & Date
	if qLower == "time" || qLower == "time now" || qLower == "current time" {
		now := time.Now().UTC()
		return &InstantAnswer{
			Type:        "fact",
			Title:       now.Format("15:04:05 UTC"),
			Subtitle:    now.Format("Monday, January 2, 2006"),
			Description: "Coordinated Universal Time (UTC)",
			Badge:       "Time",
		}
	}

	// 6. Direct Knowledge Facts & Technology Origin Answers
	switch qLower {
	case "who created python", "python creator", "creator of python":
		return &InstantAnswer{
			Type:        "fact",
			Title:       "Guido van Rossum (1991)",
			Subtitle:    "Created the Python programming language at Centrum Wiskunde & Informatica (CWI)",
			Description: "Named after Monty Python's Flying Circus; designed with an emphasis on code readability.",
			Badge:       "Knowledge Fact",
		}
	case "who created rust", "rust creator", "creator of rust":
		return &InstantAnswer{
			Type:        "fact",
			Title:       "Graydon Hoare (2006, Mozilla)",
			Subtitle:    "Designed Rust as a memory-safe, concurrent systems programming language",
			Description: "Sponsored by Mozilla Research and now governed by the independent Rust Foundation.",
			Badge:       "Knowledge Fact",
		}
	case "who created go", "who created golang", "golang creator":
		return &InstantAnswer{
			Type:        "fact",
			Title:       "Robert Griesemer, Rob Pike, Ken Thompson (2009, Google)",
			Subtitle:    "Designed Go at Google for multicore networked systems and fast compilation",
			Description: "Featured goroutines, structural typing, memory safety, and CSP-style concurrency.",
			Badge:       "Knowledge Fact",
		}
	case "what is pagerank", "define pagerank":
		return &InstantAnswer{
			Type:        "definition",
			Title:       "PageRank Algorithm (Google)",
			Subtitle:    "Link-analysis algorithm measuring webpage authority",
			Description: "Assigns numerical weight based on incoming hyperlink count and the PageRank of the linking pages: P(u) = (1-d)/N + d × Σ P(v)/L(v).",
			Badge:       "Algorithm Definition",
		}
	case "what is bm25", "define bm25", "okapi bm25":
		return &InstantAnswer{
			Type:        "definition",
			Title:       "Okapi BM25 (Best Matching 25)",
			Subtitle:    "Probabilistic Relevance Framework in Information Retrieval",
			Description: "Non-linear term frequency saturation ranker with document length normalization: scoring documents based on query term frequency and inverse document frequency (IDF).",
			Badge:       "IR Framework",
		}
	}

	return nil
}

func convertUnits(val float64, from, to string) (float64, string, bool) {
	// Length
	if (from == "km" || from == "kilometers") && (to == "miles" || to == "mile") {
		return val * 0.621371, "miles", true
	}
	if (from == "miles" || from == "mile") && (to == "km" || to == "kilometers") {
		return val * 1.60934, "km", true
	}
	if (from == "meters" || from == "m") && (to == "feet" || to == "ft") {
		return val * 3.28084, "feet", true
	}
	if (from == "feet" || from == "ft") && (to == "meters" || to == "m") {
		return val * 0.3048, "meters", true
	}
	if (from == "inches" || from == "in") && (to == "cm" || to == "centimeters") {
		return val * 2.54, "cm", true
	}
	if (from == "cm" || from == "centimeters") && (to == "inches" || to == "in") {
		return val / 2.54, "inches", true
	}

	// Weight
	if (from == "kg" || from == "kilograms") && (to == "lbs" || to == "pounds") {
		return val * 2.20462, "lbs", true
	}
	if (from == "lbs" || from == "pounds") && (to == "kg" || to == "kilograms") {
		return val * 0.453592, "kg", true
	}

	// Temperature
	if (from == "c" || from == "celsius") && (to == "f" || to == "fahrenheit") {
		return (val * 9.0 / 5.0) + 32.0, "°F", true
	}
	if (from == "f" || from == "fahrenheit") && (to == "c" || to == "celsius") {
		return (val - 32.0) * 5.0 / 9.0, "°C", true
	}

	// Digital Data
	if (from == "mb" || from == "megabytes") && (to == "gb" || to == "gigabytes") {
		return val / 1024.0, "GB", true
	}
	if (from == "gb" || from == "gigabytes") && (to == "mb" || to == "megabytes") {
		return val * 1024.0, "MB", true
	}
	if (from == "tb" || from == "terabytes") && (to == "gb" || to == "gigabytes") {
		return val * 1024.0, "GB", true
	}

	return 0, "", false
}

