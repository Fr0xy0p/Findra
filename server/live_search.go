package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

var (
	htmlTagRegex = regexp.MustCompile(`<[^>]*>`)
	spaceRegex   = regexp.MustCompile(`\s+`)
	ddgLinkRegex = regexp.MustCompile(`<a rel="nofollow" href="([^"]+)" class='result-link'>([^<]+)</a>`)
	ddgSnipRegex = regexp.MustCompile(`(?s)<td class='result-snippet'>\s*(.*?)\s*</td>`)
)

// CleanHTMLStrips HTML tags and unescapes entities
func CleanHTML(input string) string {
	stripped := htmlTagRegex.ReplaceAllString(input, " ")
	unescaped := html.UnescapeString(stripped)
	return strings.TrimSpace(spaceRegex.ReplaceAllString(unescaped, " "))
}

type LiveSearchService struct {
	client    *http.Client
	autoIdxMu sync.Mutex
}

func NewLiveSearchService() *LiveSearchService {
	return &LiveSearchService{
		client: &http.Client{
			Timeout: 4 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        50,
				MaxIdleConnsPerHost: 20,
				IdleConnTimeout:     60 * time.Second,
			},
		},
	}
}

// resolveNavigationalBrand checks if the query refers to a well-known brand/site
// and returns its official canonical root website as the #1 target.
func resolveNavigationalBrand(query string) *SearchResultItem {
	q := strings.ToLower(strings.TrimSpace(query))
	q = strings.TrimPrefix(q, "https://")
	q = strings.TrimPrefix(q, "http://")
	q = strings.TrimPrefix(q, "www.")
	q = strings.TrimSuffix(q, "/")
	q = strings.TrimSuffix(q, ".com")
	q = strings.TrimSuffix(q, ".org")
	q = strings.TrimSuffix(q, ".net")
	q = strings.TrimSuffix(q, ".tv")

	brands := map[string]struct {
		url     string
		domain  string
		title   string
		snippet string
	}{
		"youtube": {
			url:     "https://www.youtube.com/",
			domain:  "www.youtube.com",
			title:   "YouTube",
			snippet: "Enjoy the videos and music you love, upload original content, and share it all with friends, family, and the world on YouTube.",
		},
		"github": {
			url:     "https://github.com/",
			domain:  "github.com",
			title:   "GitHub: Let’s build from here",
			snippet: "GitHub is where over 100 million developers shape the future of software, together. Contribute to open source, build apps, and manage code.",
		},
		"google": {
			url:     "https://www.google.com/",
			domain:  "www.google.com",
			title:   "Google",
			snippet: "Search the world's information, including webpages, images, videos and more.",
		},
		"reddit": {
			url:     "https://www.reddit.com/",
			domain:  "www.reddit.com",
			title:   "Reddit - Dive into anything",
			snippet: "Reddit is a network of communities where people can dive into their interests, hobbies and passions.",
		},
		"netflix": {
			url:     "https://www.netflix.com/",
			domain:  "www.netflix.com",
			title:   "Netflix - Watch TV Shows Online, Watch Movies Online",
			snippet: "Watch Netflix movies & TV shows online or stream right to your smart TV, game console, PC, Mac, mobile, tablet and more.",
		},
		"spotify": {
			url:     "https://www.spotify.com/",
			domain:  "www.spotify.com",
			title:   "Spotify - Web Player: Music for everyone",
			snippet: "Spotify is a digital music service that gives you access to millions of songs, podcasts and videos from artists all over the world.",
		},
		"twitter": {
			url:     "https://x.com/",
			domain:  "x.com",
			title:   "X (formerly Twitter)",
			snippet: "From breaking news and entertainment to sports and politics, get the full story with all the live commentary.",
		},
		"x": {
			url:     "https://x.com/",
			domain:  "x.com",
			title:   "X (formerly Twitter)",
			snippet: "From breaking news and entertainment to sports and politics, get the full story with all the live commentary.",
		},
		"amazon": {
			url:     "https://www.amazon.com/",
			domain:  "www.amazon.com",
			title:   "Amazon.com. Spend less. Smile more.",
			snippet: "Free shipping on millions of items. Get the best of Shopping and Entertainment with Prime.",
		},
		"linkedin": {
			url:     "https://www.linkedin.com/",
			domain:  "www.linkedin.com",
			title:   "LinkedIn: Log In or Sign Up",
			snippet: "1 billion members | Manage your professional identity. Build and engage with your professional network.",
		},
		"instagram": {
			url:     "https://www.instagram.com/",
			domain:  "www.instagram.com",
			title:   "Instagram",
			snippet: "Create an account or log in to Instagram - Share what you're into with the people who get you.",
		},
		"facebook": {
			url:     "https://www.facebook.com/",
			domain:  "www.facebook.com",
			title:   "Facebook - Log In or Sign Up",
			snippet: "Connect with friends and the world around you on Facebook.",
		},
		"chatgpt": {
			url:     "https://chatgpt.com/",
			domain:  "chatgpt.com",
			title:   "ChatGPT - OpenAI",
			snippet: "ChatGPT is a free-to-use AI system. Use it for engaging conversations, gain insights, automate tasks, and witness the future of AI.",
		},
		"wikipedia": {
			url:     "https://www.wikipedia.org/",
			domain:  "www.wikipedia.org",
			title:   "Wikipedia, the free encyclopedia",
			snippet: "Wikipedia is a free online encyclopedia, created and edited by volunteers around the world and hosted by the Wikimedia Foundation.",
		},
		"stackoverflow": {
			url:     "https://stackoverflow.com/",
			domain:  "stackoverflow.com",
			title:   "Stack Overflow - Where Developers Learn, Share, & Build Careers",
			snippet: "Stack Overflow is the largest, most trusted online community for developers to learn, share their programming knowledge, and build their careers.",
		},
		"twitch": {
			url:     "https://www.twitch.tv/",
			domain:  "www.twitch.tv",
			title:   "Twitch",
			snippet: "Twitch is an interactive livestreaming service for content spanning gaming, entertainment, sports, music, and more.",
		},
		"discord": {
			url:     "https://discord.com/",
			domain:  "discord.com",
			title:   "Discord - Group Chat That’s All Fun & Games",
			snippet: "Discord is great for playing games and chilling with friends, or even building a worldwide community.",
		},
	}

	if b, ok := brands[q]; ok {
		return &SearchResultItem{
			DocID:           800000,
			URL:             b.url,
			Domain:          b.domain,
			Title:           b.title,
			Snippet:         b.snippet,
			Score:           28.0,
			BM25Score:       18.0,
			PageRankScore:   0.98,
			TrustRankScore:  0.99,
			Headings:        []string{b.title},
			IsPhraseMatch:   true,
			MatchedInAnchor: true,
		}
	}
	return nil
}

// DiscoverLiveWeb searches DuckDuckGo Lite and Wikipedia, prioritizing real websites over encyclopedia entries
func (s *LiveSearchService) DiscoverLiveWeb(query string, limit int) ([]SearchResultItem, error) {
	if limit <= 0 {
		limit = 10
	}

	var (
		wg        sync.WaitGroup
		ddgItems  []SearchResultItem
		wikiItems []SearchResultItem
	)

	wg.Add(2)

	// 1. Fetch from DuckDuckGo Lite (Actual official web pages)
	go func() {
		defer wg.Done()
		items, err := s.fetchDuckDuckGoLite(query)
		if err == nil {
			ddgItems = items
		}
	}()

	// 2. Fetch from Wikipedia Search API (Authoritative encyclopedia knowledge)
	go func() {
		defer wg.Done()
		items, err := s.fetchWikipediaSearch(query, limit)
		if err == nil {
			wikiItems = items
		}
	}()

	wg.Wait()

	var results []SearchResultItem
	seen := make(map[string]bool)

	// A. Check if query is a Navigational Brand query (e.g. "youtube", "github")
	brandItem := resolveNavigationalBrand(query)
	if brandItem != nil {
		results = append(results, *brandItem)
		seen[normalizeURL(brandItem.URL)] = true
	}

	// B. Prioritize DuckDuckGo Lite results (Real live domains and websites)
	for _, it := range ddgItems {
		cleanURL := cleanCanonicalURL(it.URL)
		it.URL = cleanURL
		norm := normalizeURL(cleanURL)
		if !seen[norm] {
			seen[norm] = true
			results = append(results, it)
		}
	}

	// C. Append Wikipedia entries as complementary reference links
	for _, it := range wikiItems {
		norm := normalizeURL(it.URL)
		if !seen[norm] {
			seen[norm] = true
			results = append(results, it)
		}
	}

	if len(results) == 0 {
		return nil, fmt.Errorf("no live web results found for query: %s", query)
	}

	// Trim to limit and assign rank scores
	if len(results) > limit {
		results = results[:limit]
	}

	for i := range results {
		if results[i].Score == 0 {
			rank := float64(i)
			results[i].DocID = uint32(800000 + i)
			results[i].BM25Score = 8.5 - (rank * 0.4)
			if results[i].BM25Score < 1.0 {
				results[i].BM25Score = 1.0
			}
			results[i].PageRankScore = 0.90 - (rank * 0.04)
			if results[i].PageRankScore < 0.2 {
				results[i].PageRankScore = 0.2
			}
			results[i].TrustRankScore = 0.95 - (rank * 0.03)
			results[i].Score = results[i].BM25Score + (results[i].PageRankScore * 2.5)
		}
	}

	return results, nil
}

func cleanCanonicalURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	q := u.Query()
	q.Del("gl")
	q.Del("ref")
	q.Del("utm_source")
	q.Del("utm_medium")
	q.Del("utm_campaign")
	if len(q) == 0 {
		u.RawQuery = ""
	} else {
		u.RawQuery = q.Encode()
	}
	return u.String()
}

func (s *LiveSearchService) fetchDuckDuckGoLite(query string) ([]SearchResultItem, error) {
	data := url.Values{}
	data.Set("q", query)

	req, err := http.NewRequest("POST", "https://lite.duckduckgo.com/lite/", strings.NewReader(data.Encode()))
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	bodyStr := string(bodyBytes)

	linkMatches := ddgLinkRegex.FindAllStringSubmatch(bodyStr, -1)
	snipMatches := ddgSnipRegex.FindAllStringSubmatch(bodyStr, -1)

	var items []SearchResultItem
	count := len(linkMatches)
	if len(snipMatches) < count {
		count = len(snipMatches)
	}

	for i := 0; i < count; i++ {
		rawURL := linkMatches[i][1]
		title := CleanHTML(linkMatches[i][2])
		snippet := CleanHTML(snipMatches[i][1])

		// Skip ad/tracker redirects if any
		if strings.Contains(rawURL, "duckduckgo.com/y.js") {
			continue
		}

		domain := extractDomain(rawURL)
		if domain == "" || title == "" {
			continue
		}

		items = append(items, SearchResultItem{
			URL:      rawURL,
			Domain:   domain,
			Title:    title,
			Snippet:  snippet,
			Headings: []string{title},
		})
	}

	return items, nil
}

func (s *LiveSearchService) fetchWikipediaSearch(query string, limit int) ([]SearchResultItem, error) {
	apiURL := fmt.Sprintf("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=%s&format=json&utf8=1&srlimit=%d",
		url.QueryEscape(query), limit)

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "FindraSearchEngine/1.0 (contact: info@findra.search)")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var data struct {
		Query struct {
			Search []struct {
				Title     string `json:"title"`
				Snippet   string `json:"snippet"`
				WordCount int    `json:"wordcount"`
			} `json:"search"`
		} `json:"query"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	var items []SearchResultItem
	for _, it := range data.Query.Search {
		pageURL := fmt.Sprintf("https://en.wikipedia.org/wiki/%s", url.PathEscape(strings.ReplaceAll(it.Title, " ", "_")))
		cleanTitle := it.Title + " - Wikipedia"
		cleanSnippet := CleanHTML(it.Snippet)

		items = append(items, SearchResultItem{
			URL:             pageURL,
			Domain:          "en.wikipedia.org",
			Title:           cleanTitle,
			Snippet:         cleanSnippet,
			Headings:        []string{it.Title},
			MatchedInAnchor: true,
		})
	}

	return items, nil
}

// AutoIndexDiscovered writes newly discovered pages to data/parsed/documents.jsonl
// and reloads the Rust index server
func (s *LiveSearchService) AutoIndexDiscovered(docsPath, crawlPath string, indexClient *IndexClient, items []SearchResultItem) {
	s.autoIdxMu.Lock()
	defer s.autoIdxMu.Unlock()

	if len(items) == 0 {
		return
	}

	// 1. Find max doc_id in documents.jsonl
	maxID := uint32(10000)
	existingURLs := make(map[string]bool)

	if f, err := os.Open(docsPath); err == nil {
		reader := bufio.NewReader(f)
		for {
			line, err := reader.ReadString('\n')
			if len(line) > 0 {
				trimmed := strings.TrimSpace(line)
				if trimmed != "" {
					var doc struct {
						DocID uint32 `json:"doc_id"`
						URL   string `json:"url"`
					}
					if err := json.Unmarshal([]byte(trimmed), &doc); err == nil {
						if doc.DocID > maxID {
							maxID = doc.DocID
						}
						existingURLs[normalizeURL(doc.URL)] = true
					}
				}
			}
			if err != nil {
				break
			}
		}
		f.Close()
	}

	// 2. Open documents.jsonl for appending
	if err := os.MkdirAll(filepath.Dir(docsPath), 0755); err != nil {
		return
	}

	docsFile, err := os.OpenFile(docsPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return
	}
	defer docsFile.Close()

	crawlFile, _ := os.OpenFile(crawlPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if crawlFile != nil {
		defer crawlFile.Close()
	}

	newCount := 0
	for _, item := range items {
		norm := normalizeURL(item.URL)
		if existingURLs[norm] {
			continue
		}
		existingURLs[norm] = true
		maxID++
		newCount++

		// Tokenize title and snippet for index lexicon
		fullText := item.Title + " " + item.Snippet
		tokens, termFreqs, termPositions := tokenizeAndIndexText(fullText)

		docRecord := map[string]interface{}{
			"doc_id":               maxID,
			"url":                  item.URL,
			"title":                item.Title,
			"description":          item.Snippet,
			"headings":             item.Headings,
			"text_snippet":         item.Snippet,
			"doc_length":           len(tokens),
			"char_count":           len(fullText),
			"tokens":               tokens,
			"term_frequencies":     termFreqs,
			"term_positions":       termPositions,
			"anchor_tokens":        tokens,
			"inbound_anchor_count": 2,
			"crawled_at":           time.Now().UTC().Format(time.RFC3339),
		}

		lineBytes, err := json.Marshal(docRecord)
		if err == nil {
			docsFile.Write(lineBytes)
			docsFile.WriteString("\n")
		}

		if crawlFile != nil {
			crawlRec := map[string]interface{}{
				"url":        item.URL,
				"title":      item.Title,
				"html":       fmt.Sprintf("<html><head><title>%s</title></head><body><h1>%s</h1><p>%s</p></body></html>", item.Title, item.Title, item.Snippet),
				"crawled_at": time.Now().UTC().Format(time.RFC3339),
			}
			if cBytes, cErr := json.Marshal(crawlRec); cErr == nil {
				crawlFile.Write(cBytes)
				crawlFile.WriteString("\n")
			}
		}
	}

	if newCount > 0 {
		fmt.Printf("🌐 [Live Auto-Indexer] Appended %d new worldwide pages to %s (max_id=%d)\n", newCount, docsPath, maxID)
		if indexClient != nil {
			if err := indexClient.Reload(); err != nil {
				fmt.Printf("[-] Failed to reload Rust index server: %v\n", err)
			} else {
				fmt.Printf("🦀 [Live Auto-Indexer] Successfully triggered hot-reload of Rust inverted index!\n")
			}
		}
	}
}

func tokenizeAndIndexText(text string) ([]string, map[string]int, map[string][]uint32) {
	tokens := make([]string, 0)
	termFreqs := make(map[string]int)
	termPositions := make(map[string][]uint32)

	words := strings.Fields(text)
	pos := uint32(0)

	for _, raw := range words {
		cleaned := strings.ToLower(strings.Trim(raw, ".,;:!?'\"()[]{}<>/\\|@#$%^&*-_=+\u2014\u2013"))
		if len(cleaned) < 2 {
			continue
		}

		// Simple Porter-like suffix normalization for common roots
		cleaned = normalizeStem(cleaned)

		tokens = append(tokens, cleaned)
		termFreqs[cleaned]++
		termPositions[cleaned] = append(termPositions[cleaned], pos)
		pos++
	}

	return tokens, termFreqs, termPositions
}

func normalizeStem(s string) string {
	if strings.HasSuffix(s, "sses") {
		return s[:len(s)-2]
	}
	if strings.HasSuffix(s, "ies") {
		return s[:len(s)-2]
	}
	if strings.HasSuffix(s, "ing") && len(s) > 5 {
		return s[:len(s)-3]
	}
	if strings.HasSuffix(s, "ed") && len(s) > 4 {
		return s[:len(s)-2]
	}
	if strings.HasSuffix(s, "s") && !strings.HasSuffix(s, "ss") && len(s) > 3 {
		return s[:len(s)-1]
	}
	return s
}

func normalizeURL(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	raw = strings.TrimSuffix(raw, "/")
	return raw
}

func extractDomain(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return u.Hostname()
}
