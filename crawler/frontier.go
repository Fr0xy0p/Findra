package main

import (
	"net/url"
	"strings"
	"sync"
)

type CrawlItem struct {
	URL   string
	Depth int
}

type URLFrontier struct {
	mu             sync.Mutex
	queue          []CrawlItem
	bloom          *BloomFilter
	visited        map[string]bool
	allowedDomains map[string]bool
	maxDepth       int
}

func NewURLFrontier(maxDepth int, allowedDomains []string) *URLFrontier {
	domains := make(map[string]bool)
	for _, d := range allowedDomains {
		if d != "" {
			domains[strings.ToLower(strings.TrimSpace(d))] = true
		}
	}

	return &URLFrontier{
		queue:          make([]CrawlItem, 0),
		bloom:          NewBloomFilter(250000, 0.001), // 250k items, 0.1% false-positive rate
		visited:        make(map[string]bool),
		allowedDomains: domains,
		maxDepth:       maxDepth,
	}
}

// Canonicalize cleans URL, strips fragment, and lowercases domain
func Canonicalize(rawURL string) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	parsed.Fragment = ""
	parsed.Host = strings.ToLower(parsed.Host)
	if parsed.Scheme == "" {
		parsed.Scheme = "https"
	}
	if parsed.Path == "" {
		parsed.Path = "/"
	}
	return parsed.String(), nil
}

// Push adds a new URL to the frontier if it hasn't been visited or queued
func (f *URLFrontier) Push(rawURL string, depth int) bool {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.maxDepth > 0 && depth > f.maxDepth {
		return false
	}

	canonical, err := Canonicalize(rawURL)
	if err != nil {
		return false
	}

	// Check domain restriction if enabled
	if len(f.allowedDomains) > 0 {
		parsed, err := url.Parse(canonical)
		if err != nil || !f.allowedDomains[parsed.Hostname()] {
			return false
		}
	}

	// High-speed Bloom Filter test
	if f.bloom.Contains(canonical) && f.visited[canonical] {
		return false
	}

	f.bloom.Add(canonical)
	f.visited[canonical] = true
	f.queue = append(f.queue, CrawlItem{URL: canonical, Depth: depth})
	return true
}

// Pop retrieves the next URL in the queue
func (f *URLFrontier) Pop() (CrawlItem, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if len(f.queue) == 0 {
		return CrawlItem{}, false
	}

	item := f.queue[0]
	f.queue = f.queue[1:]
	return item, true
}

// Size returns count of queued and total visited items
func (f *URLFrontier) Size() (queued int, visited int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.queue), len(f.visited)
}
