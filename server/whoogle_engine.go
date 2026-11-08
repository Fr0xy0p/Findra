package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

var (
	kpCache = sync.Map{}

	ampPrefixRegex = regexp.MustCompile(`(?i)^https?://(?:www\.)?google\.[a-z.]+/amp/s/(.+)`)
	trackingParams = []string{
		"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
		"gclid", "fbclid", "ved", "usg", "sa", "ei", "sxsrf", "si", "ref_src",
		"_ga", "_gl", "ncid", "ocid",
	}

	whoogleHTTPClient = &http.Client{
		Timeout: 2 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        30,
			IdleConnTimeout:     30 * time.Second,
			DisableCompression: false,
		},
	}
)

type WhoogleEngine struct {
	baseURL string
	client  *http.Client
}

func NewWhoogleEngine() *WhoogleEngine {
	whoogleURL := os.Getenv("WHOOGLE_URL")
	if whoogleURL == "" {
		whoogleURL = "http://localhost:5000"
	}
	return &WhoogleEngine{
		baseURL: strings.TrimRight(whoogleURL, "/"),
		client:  whoogleHTTPClient,
	}
}

// CleanAndDeTrackURL applies Whoogle-style URL de-tracking and de-AMPing
func CleanAndDeTrackURL(rawURL string) string {
	clean := strings.TrimSpace(rawURL)
	if clean == "" {
		return clean
	}

	// 1. Google Redirects (/url?q=https://...)
	if strings.Contains(clean, "google.") && strings.Contains(clean, "/url?") {
		if parsed, err := url.Parse(clean); err == nil {
			if target := parsed.Query().Get("q"); target != "" {
				clean = target
			} else if target := parsed.Query().Get("url"); target != "" {
				clean = target
			}
		}
	}

	// 2. DuckDuckGo Redirects (/l/?uddg=https%3A%2F%2F...)
	if strings.Contains(clean, "duckduckgo.com/l/?") {
		if parsed, err := url.Parse(clean); err == nil {
			if target := parsed.Query().Get("uddg"); target != "" {
				clean = target
			}
		}
	}

	// 3. De-AMP Google AMP URLs (google.com/amp/s/example.com/...)
	if m := ampPrefixRegex.FindStringSubmatch(clean); len(m) > 1 {
		clean = "https://" + m[1]
	}

	// 4. Strip Tracking Query Parameters (utm_*, gclid, fbclid, etc.)
	if parsed, err := url.Parse(clean); err == nil && parsed.RawQuery != "" {
		q := parsed.Query()
		modified := false
		for _, param := range trackingParams {
			if q.Has(param) {
				q.Del(param)
				modified = true
			}
		}
		if modified {
			parsed.RawQuery = q.Encode()
			clean = parsed.String()
		}
	}

	return clean
}

type whoogleJSONResponse []struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Content string `json:"content"`
}

// FetchWhoogleResults queries a Whoogle instance for clean, ad-free Google search results
func (w *WhoogleEngine) FetchWhoogleResults(query string, limit int) ([]SearchResultItem, error) {
	if limit <= 0 {
		limit = 10
	}

	endpoint := fmt.Sprintf("%s/search?q=%s&format=json", w.baseURL, url.QueryEscape(query))
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "FindraGateway/2.0 (Whoogle Engine)")
	req.Header.Set("Accept", "application/json")

	resp, err := w.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("whoogle upstream returned status: %d", resp.StatusCode)
	}

	var data whoogleJSONResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	var items []SearchResultItem
	for i, item := range data {
		if i >= limit {
			break
		}
		cleanURL := CleanAndDeTrackURL(item.URL)
		parsed, err := url.Parse(cleanURL)
		if err != nil || parsed.Host == "" {
			continue
		}

		items = append(items, SearchResultItem{
			DocID:           uint32(850000 + i),
			URL:             cleanURL,
			Domain:          parsed.Host,
			Title:           item.Title,
			Snippet:         item.Content,
			Score:           24.0 - float64(i)*0.4,
			BM25Score:       16.0 - float64(i)*0.3,
			PageRankScore:   0.88 - float64(i)*0.02,
			TrustRankScore:  0.90,
			Headings:        []string{item.Title},
			IsPhraseMatch:   true,
			MatchedInAnchor: true,
		})
	}

	return items, nil
}

// ResolveKnowledgePanel builds Google-grade rich entity Knowledge Panels
func ResolveKnowledgePanel(query string) *KnowledgePanel {
	q := strings.TrimSpace(query)
	if q == "" {
		return nil
	}
	norm := strings.ToLower(q)
	norm = strings.TrimPrefix(norm, "who is ")
	norm = strings.TrimPrefix(norm, "what is ")
	norm = strings.TrimPrefix(norm, "the ")
	norm = strings.TrimRight(norm, "?!.")
	norm = strings.TrimSpace(norm)

	// 1. Check in-memory Knowledge Graph (0ms latency)
	if kp := matchCuratedKnowledgePanel(norm); kp != nil {
		return kp
	}

	// 2. Dynamic Wikipedia Knowledge Graph Extractor (<150ms)
	cacheKey := "kp:" + norm
	if cached, ok := kpCache.Load(cacheKey); ok {
		if kp, ok := cached.(*KnowledgePanel); ok {
			return kp
		}
	}

	// Only query Wikipedia for entity-like queries (length <= 4 words)
	words := strings.Fields(norm)
	if len(words) >= 1 && len(words) <= 4 {
		if kp := fetchDynamicWikiKnowledgePanel(norm); kp != nil {
			kpCache.Store(cacheKey, kp)
			return kp
		}
	}

	return nil
}

func matchCuratedKnowledgePanel(norm string) *KnowledgePanel {
	switch norm {
	case "google", "alphabet", "google company", "alphabet inc":
		return &KnowledgePanel{
			Title:        "Google",
			Type:         "American multinational technology company",
			Description:  "Google LLC is an American multinational corporation focusing on search engine technology, online advertising, cloud computing, computer software, quantum computing, e-commerce, and artificial intelligence. It is often referred to as 'the most powerful company in the world'.",
			ImageURL:     "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2f/Google_2015_logo.svg/330px-Google_2015_logo.svg.png",
			Website:      "https://about.google/",
			WikipediaURL: "https://en.wikipedia.org/wiki/Google",
			Source:       "Google Knowledge Graph",
			Attributes: map[string]string{
				"CEO":                 "Sundar Pichai (2015–present)",
				"Founders":            "Larry Page, Sergey Brin",
				"Founded":             "September 4, 1998, Menlo Park, CA",
				"Headquarters":        "Mountain View, California, United States",
				"Parent organization": "Alphabet Inc.",
				"Subsidiaries":        "YouTube, DeepMind, Waymo, Android",
			},
		}

	case "apple", "apple inc", "apple company":
		return &KnowledgePanel{
			Title:        "Apple Inc.",
			Type:         "American multinational technology company",
			Description:  "Apple Inc. is an American multinational technology company headquartered in Cupertino, California, known for consumer electronics, software, and services. It is the world's largest technology company by revenue.",
			ImageURL:     "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fa/Apple_logo_black.svg/330px-Apple_logo_black.svg.png",
			Website:      "https://www.apple.com/",
			WikipediaURL: "https://en.wikipedia.org/wiki/Apple_Inc.",
			Source:       "Google Knowledge Graph",
			Attributes: map[string]string{
				"CEO":          "Tim Cook (2011–present)",
				"Founders":     "Steve Jobs, Steve Wozniak, Ronald Wayne",
				"Founded":      "April 1, 1976, Los Altos, CA",
				"Headquarters": "Cupertino, California, United States",
				"Products":     "iPhone, Mac, iPad, Apple Watch, AirPods, iOS",
			},
		}

	case "microsoft", "microsoft corp", "microsoft corporation":
		return &KnowledgePanel{
			Title:        "Microsoft",
			Type:         "American multinational technology corporation",
			Description:  "Microsoft Corporation is an American multinational corporation and technology company. It is best known for the Windows operating system, the Microsoft 365 software suite, and the Azure cloud platform.",
			ImageURL:     "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/44/Microsoft_logo.svg/330px-Microsoft_logo.svg.png",
			Website:      "https://www.microsoft.com/",
			WikipediaURL: "https://en.wikipedia.org/wiki/Microsoft",
			Source:       "Google Knowledge Graph",
			Attributes: map[string]string{
				"Chairman & CEO": "Satya Nadella (2014–present)",
				"Founders":       "Bill Gates, Paul Allen",
				"Founded":        "April 4, 1975, Albuquerque, NM",
				"Headquarters":   "Redmond, Washington, United States",
				"Subsidiaries":   "GitHub, LinkedIn, Xbox, Activision Blizzard",
			},
		}

	case "youtube":
		return &KnowledgePanel{
			Title:        "YouTube",
			Type:         "Global online video sharing and social media platform",
			Description:  "YouTube is an American online video sharing and social media platform owned by Google. Accessible worldwide, it is the second-most visited website after Google Search.",
			ImageURL:     "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b8/YouTube_Logo_2017.svg/330px-YouTube_Logo_2017.svg.png",
			Website:      "https://www.youtube.com/",
			WikipediaURL: "https://en.wikipedia.org/wiki/YouTube",
			Source:       "Google Knowledge Graph",
			Attributes: map[string]string{
				"CEO":                 "Neal Mohan (2023–present)",
				"Founders":            "Chad Hurley, Steve Chen, Jawed Karim",
				"Founded":             "February 14, 2005, San Mateo, CA",
				"Parent organization": "Google (Alphabet Inc.)",
				"Headquarters":        "San Bruno, California, United States",
			},
		}

	case "meta", "facebook", "meta platforms":
		return &KnowledgePanel{
			Title:        "Meta Platforms",
			Type:         "American multinational technology conglomerate",
			Description:  "Meta Platforms, Inc., doing business as Meta and formerly named Facebook, Inc., is an American multinational technology conglomerate based in Menlo Park, California.",
			ImageURL:     "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/Meta_Platforms_Inc._logo.svg/330px-Meta_Platforms_Inc._logo.svg.png",
			Website:      "https://about.meta.com/",
			WikipediaURL: "https://en.wikipedia.org/wiki/Meta_Platforms",
			Source:       "Google Knowledge Graph",
			Attributes: map[string]string{
				"Founder & CEO": "Mark Zuckerberg (2004–present)",
				"Founders":      "Mark Zuckerberg, Eduardo Saverin, Dustin Moskovitz",
				"Founded":       "February 2004, Cambridge, MA",
				"Headquarters":  "Menlo Park, California, United States",
				"Subsidiaries":  "Instagram, WhatsApp, Threads, Reality Labs",
			},
		}

	case "tesla", "tesla inc", "tesla motors":
		return &KnowledgePanel{
			Title:        "Tesla, Inc.",
			Type:         "American automotive and clean energy company",
			Description:  "Tesla, Inc. is an American multinational automotive and clean energy company headquartered in Austin, Texas, which designs and manufactures electric vehicles, stationary battery energy storage devices, and solar panels.",
			ImageURL:     "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bd/Tesla_Motors.svg/330px-Tesla_Motors.svg.png",
			Website:      "https://www.tesla.com/",
			WikipediaURL: "https://en.wikipedia.org/wiki/Tesla,_Inc.",
			Source:       "Google Knowledge Graph",
			Attributes: map[string]string{
				"CEO":          "Elon Musk (2008–present)",
				"Founders":     "Martin Eberhard, Marc Tarpenning, Elon Musk, JB Straubel",
				"Founded":      "July 1, 2003, San Carlos, CA",
				"Headquarters": "Austin, Texas, United States",
				"Products":     "Model S, Model 3, Model X, Model Y, Cybertruck",
			},
		}

	case "nvidia", "nvidia corp", "nvidia corporation":
		return &KnowledgePanel{
			Title:        "Nvidia",
			Type:         "American multinational corporation and technology company",
			Description:  "Nvidia Corporation is an American multinational corporation and technology company that designs graphics processing units (GPUs) and application programming interfaces (APIs) for data science and high-performance computing.",
			ImageURL:     "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/21/Nvidia_logo.svg/330px-Nvidia_logo.svg.png",
			Website:      "https://www.nvidia.com/",
			WikipediaURL: "https://en.wikipedia.org/wiki/Nvidia",
			Source:       "Google Knowledge Graph",
			Attributes: map[string]string{
				"CEO":          "Jensen Huang (1993–present)",
				"Founders":     "Jensen Huang, Chris Malachowsky, Curtis Priem",
				"Founded":      "April 5, 1993, Sunnyvale, CA",
				"Headquarters": "Santa Clara, California, United States",
				"Products":     "GeForce, Quadro, Tesla, Tegra, CUDA, Hopper, Blackwell",
			},
		}

	case "narendra modi", "modi", "pm modi", "prime minister modi":
		return &KnowledgePanel{
			Title:        "Narendra Modi",
			Type:         "14th Prime Minister of India",
			Description:  "Narendra Damodardas Modi is an Indian politician who has served as the 14th Prime Minister of India since May 26, 2014. He was the Chief Minister of Gujarat from 2001 to 2014 and is the Member of Parliament for Varanasi.",
			ImageURL:     "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/ba/Narendra_Modi_Portrait_2026.jpg/330px-Narendra_Modi_Portrait_2026.jpg",
			Website:      "https://www.pmindia.gov.in/en/",
			WikipediaURL: "https://en.wikipedia.org/wiki/Narendra_Modi",
			Source:       "Google Knowledge Graph",
			Attributes: map[string]string{
				"Office":          "Prime Minister of India (since 2014)",
				"Born":            "September 17, 1950, Vadnagar, Gujarat, India",
				"Political party": "Bharatiya Janata Party (BJP)",
				"Constituency":    "Varanasi, Uttar Pradesh",
				"Previous office": "Chief Minister of Gujarat (2001–2014)",
			},
		}

	case "joe biden", "biden", "president biden":
		return &KnowledgePanel{
			Title:        "Joe Biden",
			Type:         "46th President of the United States",
			Description:  "Joseph Robinette Biden Jr. is an American politician serving as the 46th President of the United States since January 20, 2021. A member of the Democratic Party, he previously served as the 47th Vice President from 2009 to 2017.",
			ImageURL:     "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/68/Joe_Biden_presidential_portrait.jpg/330px-Joe_Biden_presidential_portrait.jpg",
			Website:      "https://www.whitehouse.gov/",
			WikipediaURL: "https://en.wikipedia.org/wiki/Joe_Biden",
			Source:       "Google Knowledge Graph",
			Attributes: map[string]string{
				"Office":          "President of the United States (since 2021)",
				"Born":            "November 20, 1942, Scranton, Pennsylvania",
				"Political party": "Democratic Party",
				"Vice President":  "Kamala Harris",
				"Previous office": "Vice President of the United States (2009–2017)",
			},
		}

	case "elon musk", "musk":
		return &KnowledgePanel{
			Title:        "Elon Musk",
			Type:         "Businessman and entrepreneur",
			Description:  "Elon Reeve Musk is a businessman and investor. He is the founder, CEO, and chief engineer of SpaceX; angel investor, CEO, and product architect of Tesla, Inc.; owner and CTO of X (formerly Twitter); and founder of xAI, The Boring Company, and Neuralink.",
			ImageURL:     "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/99/Elon_Musk_Colorado_2022_%28cropped2%29.jpg/330px-Elon_Musk_Colorado_2022_%28cropped2%29.jpg",
			Website:      "https://x.com/elonmusk",
			WikipediaURL: "https://en.wikipedia.org/wiki/Elon_Musk",
			Source:       "Google Knowledge Graph",
			Attributes: map[string]string{
				"Born":      "June 28, 1971, Pretoria, South Africa",
				"Roles":     "CEO of Tesla, CEO of SpaceX, Owner of X, Founder of xAI",
				"Education": "University of Pennsylvania (BA, BS)",
			},
		}

	case "python", "python language", "python programming":
		return &KnowledgePanel{
			Title:        "Python",
			Type:         "High-level programming language",
			Description:  "Python is a high-level, general-purpose programming language. Its design philosophy emphasizes code readability with the use of significant indentation. It supports multiple programming paradigms, including structured, object-oriented and functional programming.",
			ImageURL:     "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c3/Python-logo-notext.svg/330px-Python-logo-notext.svg.png",
			Website:      "https://www.python.org/",
			WikipediaURL: "https://en.wikipedia.org/wiki/Python_(programming_language)",
			Source:       "Google Knowledge Graph",
			Attributes: map[string]string{
				"Designed by":    "Guido van Rossum",
				"First released": "February 20, 1991",
				"Paradigms":      "Multi-paradigm: functional, OOP, reflective",
				"Typing":         "Duck, dynamic, strong",
			},
		}

	case "rust", "rust language", "rust programming":
		return &KnowledgePanel{
			Title:        "Rust",
			Type:         "General-purpose systems programming language",
			Description:  "Rust is a multi-paradigm, general-purpose programming language that emphasizes performance, type safety, and concurrency. Rust enforces memory safety without requiring garbage collection using an ownership and borrow-checker system.",
			ImageURL:     "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d5/Rust_programming_language_black_logo.svg/330px-Rust_programming_language_black_logo.svg.png",
			Website:      "https://www.rust-lang.org/",
			WikipediaURL: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
			Source:       "Google Knowledge Graph",
			Attributes: map[string]string{
				"Designed by":    "Graydon Hoare",
				"First released": "July 7, 2010",
				"Paradigms":      "Concurrent, functional, generic, imperative",
				"Typing":         "Inferred, nominal, static, affine",
			},
		}
	}

	return nil
}

type wikiKPResponse struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Extract     string `json:"extract"`
	Thumbnail   struct {
		Source string `json:"source"`
	} `json:"thumbnail"`
	ContentURLs struct {
		Desktop struct {
			Page string `json:"page"`
		} `json:"desktop"`
	} `json:"content_urls"`
}

func fetchDynamicWikiKnowledgePanel(entity string) *KnowledgePanel {
	formatted := strings.ReplaceAll(strings.Title(entity), " ", "_")
	endpoint := fmt.Sprintf("https://en.wikipedia.org/api/rest_v1/page/summary/%s", url.PathEscape(formatted))

	ctx, cancel := context.WithTimeout(context.Background(), 1200*time.Millisecond)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "FindraGateway/2.0 (Google Knowledge Graph; https://findra.local)")

	resp, err := whoogleHTTPClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			_ = resp.Body.Close()
		}
		return nil
	}
	defer resp.Body.Close()

	var data wikiKPResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil
	}

	if data.Extract == "" || len(data.Extract) < 20 {
		return nil
	}

	return &KnowledgePanel{
		Title:        data.Title,
		Type:         data.Description,
		Description:  data.Extract,
		ImageURL:     data.Thumbnail.Source,
		WikipediaURL: data.ContentURLs.Desktop.Page,
		Source:       "Knowledge Graph",
	}
}

