package main

import (
	"bufio"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// RobotsData stores parsed rules and crawl delay for a domain
type RobotsData struct {
	DisallowedPaths []string
	AllowedPaths    []string
	CrawlDelay      time.Duration
	FetchedAt       time.Time
}

// RobotsCache provides thread-safe access to robots.txt data per domain
type RobotsCache struct {
	mu     sync.RWMutex
	cache  map[string]*RobotsData
	client *http.Client
}

func NewRobotsCache(client *http.Client) *RobotsCache {
	return &RobotsCache{
		cache:  make(map[string]*RobotsData),
		client: client,
	}
}

// IsAllowed checks if the given URL is allowed to be crawled according to robots.txt
func (rc *RobotsCache) IsAllowed(targetURL string, userAgent string) bool {
	parsed, err := url.Parse(targetURL)
	if err != nil {
		return false
	}

	host := parsed.Hostname()
	scheme := parsed.Scheme
	if scheme == "" {
		scheme = "https"
	}

	rc.mu.RLock()
	data, exists := rc.cache[host]
	rc.mu.RUnlock()

	if !exists {
		data = rc.fetchRobots(scheme, host, userAgent)
		rc.mu.Lock()
		rc.cache[host] = data
		rc.mu.Unlock()
	}

	reqPath := parsed.Path
	if reqPath == "" {
		reqPath = "/"
	}

	// First check explicit allows
	for _, allowed := range data.AllowedPaths {
		if strings.HasPrefix(reqPath, allowed) {
			return true
		}
	}

	// Then check disallows
	for _, disallowed := range data.DisallowedPaths {
		if disallowed == "" {
			continue
		}
		if disallowed == "/" || strings.HasPrefix(reqPath, disallowed) {
			return false
		}
	}

	return true
}

func (rc *RobotsCache) fetchRobots(scheme, host, userAgent string) *RobotsData {
	robotsURL := scheme + "://" + host + "/robots.txt"
	data := &RobotsData{
		DisallowedPaths: make([]string, 0),
		AllowedPaths:    make([]string, 0),
		FetchedAt:       time.Now(),
	}

	req, err := http.NewRequest("GET", robotsURL, nil)
	if err != nil {
		return data
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := rc.client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			_ = resp.Body.Close()
		}
		// If 404 or unreachable, default to allowing all
		return data
	}
	defer resp.Body.Close()

	// Parse robots.txt lines
	scanner := bufio.NewScanner(io.LimitReader(resp.Body, 512*1024)) // limit to 512KB
	activeUserAgent := false

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.ToLower(strings.TrimSpace(parts[0]))
		val := strings.TrimSpace(parts[1])

		if key == "user-agent" {
			agent := strings.ToLower(val)
			if agent == "*" || strings.Contains(strings.ToLower(userAgent), agent) {
				activeUserAgent = true
			} else {
				activeUserAgent = false
			}
		} else if activeUserAgent {
			if key == "disallow" {
				if val != "" {
					data.DisallowedPaths = append(data.DisallowedPaths, val)
				}
			} else if key == "allow" {
				if val != "" {
					data.AllowedPaths = append(data.AllowedPaths, val)
				}
			}
		}
	}

	return data
}

