package main

import (
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

type FetchResult struct {
	URL        string   `json:"url"`
	StatusCode int      `json:"status_code"`
	HTML       string   `json:"html"`
	Links      []string `json:"links"`
	FetchedAt  string   `json:"crawled_at"`
	Depth      int      `json:"depth"`
}

type PoliteFetcher struct {
	client       *http.Client
	userAgent    string
	robots       *RobotsCache
	delay        time.Duration
	domainLocks  sync.Map // map[string]*sync.Mutex
	lastFetchMap sync.Map // map[string]time.Time
}

func NewPoliteFetcher(userAgent string, timeout time.Duration, politenessDelay time.Duration) *PoliteFetcher {
	transport := &http.Transport{
		MaxIdleConns:        100,
		IdleConnTimeout:     30 * time.Second,
		DisableCompression: false,
		TLSClientConfig:     &tls.Config{InsecureSkipVerify: false},
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   timeout,
	}

	return &PoliteFetcher{
		client:    client,
		userAgent: userAgent,
		robots:    NewRobotsCache(client),
		delay:     politenessDelay,
	}
}

func (pf *PoliteFetcher) getDomainMutex(host string) *sync.Mutex {
	val, _ := pf.domainLocks.LoadOrStore(host, &sync.Mutex{})
	return val.(*sync.Mutex)
}

// Fetch politely downloads the target URL respecting domain delays and robots.txt
func (pf *PoliteFetcher) Fetch(targetURL string, depth int) (*FetchResult, error) {
	parsed, err := url.Parse(targetURL)
	if err != nil {
		return nil, err
	}
	host := parsed.Hostname()

	// Check robots.txt
	if !pf.robots.IsAllowed(targetURL, pf.userAgent) {
		return nil, fmt.Errorf("blocked by robots.txt for domain: %s", host)
	}

	// Domain-level rate limiting lock
	mu := pf.getDomainMutex(host)
	mu.Lock()
	if last, ok := pf.lastFetchMap.Load(host); ok {
		lastTime := last.(time.Time)
		elapsed := time.Since(lastTime)
		if elapsed < pf.delay {
			time.Sleep(pf.delay - elapsed)
		}
	}
	pf.lastFetchMap.Store(host, time.Now())
	mu.Unlock()

	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", pf.userAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := pf.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP error: %d %s", resp.StatusCode, resp.Status)
	}

	// Verify Content-Type is HTML
	contentType := resp.Header.Get("Content-Type")
	if !strings.Contains(strings.ToLower(contentType), "text/html") {
		return nil, fmt.Errorf("unsupported content-type: %s", contentType)
	}

	// Limit response size to 4MB to prevent memory exhaustion
	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return nil, err
	}

	htmlContent := string(bodyBytes)
	links := extractLinks(htmlContent, parsed)

	return &FetchResult{
		URL:        targetURL,
		StatusCode: resp.StatusCode,
		HTML:       htmlContent,
		Links:      links,
		FetchedAt:  time.Now().UTC().Format(time.RFC3339),
		Depth:      depth,
	}, nil
}

var linkRegex = regexp.MustCompile(`(?i)<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["']`)

func extractLinks(html string, baseURL *url.URL) []string {
	matches := linkRegex.FindAllStringSubmatch(html, -1)
	links := make([]string, 0, len(matches))
	seen := make(map[string]bool)

	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		raw := strings.TrimSpace(m[1])
		if raw == "" || strings.HasPrefix(raw, "#") || strings.HasPrefix(raw, "javascript:") || strings.HasPrefix(raw, "mailto:") {
			continue
		}

		resolved, err := baseURL.Parse(raw)
		if err != nil {
			continue
		}

		if resolved.Scheme != "http" && resolved.Scheme != "https" {
			continue
		}

		resolved.Fragment = ""
		canon := resolved.String()
		if !seen[canon] {
			seen[canon] = true
			links = append(links, canon)
		}
	}
	return links
}

