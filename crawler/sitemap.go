package main

import (
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type URLSet struct {
	XMLName xml.Name `xml:"urlset"`
	URLs    []URLTag `xml:"url"`
}

type URLTag struct {
	Loc     string `xml:"loc"`
	LastMod string `xml:"lastmod"`
}

type SitemapIndex struct {
	XMLName  xml.Name     `xml:"sitemapindex"`
	Sitemaps []SitemapTag `xml:"sitemap"`
}

type SitemapTag struct {
	Loc string `xml:"loc"`
}

// FetchSitemapURLs discovers and returns URLs from a sitemap or sitemap index URL
func FetchSitemapURLs(sitemapURL string, userAgent string, maxURLs int) ([]string, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", sitemapURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sitemap HTTP error: %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 5*1024*1024))
	if err != nil {
		return nil, err
	}

	var results []string

	// Try parsing as standard URLSet
	var urlSet URLSet
	if err := xml.Unmarshal(bodyBytes, &urlSet); err == nil && len(urlSet.URLs) > 0 {
		for _, u := range urlSet.URLs {
			loc := strings.TrimSpace(u.Loc)
			if loc != "" {
				results = append(results, loc)
				if len(results) >= maxURLs {
					break
				}
			}
		}
		return results, nil
	}

	// Try parsing as SitemapIndex
	var sitemapIndex SitemapIndex
	if err := xml.Unmarshal(bodyBytes, &sitemapIndex); err == nil && len(sitemapIndex.Sitemaps) > 0 {
		for _, sm := range sitemapIndex.Sitemaps {
			subLoc := strings.TrimSpace(sm.Loc)
			if subLoc != "" {
				subURLs, _ := FetchSitemapURLs(subLoc, userAgent, maxURLs-len(results))
				results = append(results, subURLs...)
				if len(results) >= maxURLs {
					break
				}
			}
		}
	}

	return results, nil
}

// DiscoverDomainSitemap tries to fetch standard /sitemap.xml for a host
func DiscoverDomainSitemap(domainURL string, userAgent string, maxURLs int) ([]string, error) {
	parsed, err := url.Parse(domainURL)
	if err != nil {
		return nil, err
	}
	sitemapURL := fmt.Sprintf("%s://%s/sitemap.xml", parsed.Scheme, parsed.Host)
	return FetchSitemapURLs(sitemapURL, userAgent, maxURLs)
}
