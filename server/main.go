package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type ServerConfig struct {
	Port         int
	RustIndexURL string
	StaticDir    string
	CacheTTL     time.Duration
}

type APIGateway struct {
	config     ServerConfig
	index      *IndexClient
	cache      *QueryCache
	liveSearch *LiveSearchService
}

func NewAPIGateway(cfg ServerConfig) *APIGateway {
	return &APIGateway{
		config:     cfg,
		index:      NewIndexClient(cfg.RustIndexURL),
		cache:      NewQueryCache(cfg.CacheTTL, 5000),
		liveSearch: NewLiveSearchService(),
	}
}

func (gw *APIGateway) handleSearch(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		http.Error(w, `{"error":"query 'q' parameter is required"}`, http.StatusBadRequest)
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 50 {
		limit = 10
	}

	cacheKey := fmt.Sprintf("search:%s:%d:%d", strings.ToLower(q), page, limit)
	if cachedData, found := gw.cache.Get(cacheKey); found {
		w.Header().Set("X-Cache", "HIT")
		w.Write(cachedData)
		return
	}

	// Check for Google-style Instant Answer / OneBox calculation or fact
	instantAns := ResolveInstantAnswer(q)

	startTime := time.Now()
	res, err := gw.index.Search(q, page, limit)

	// If local index returned 0 hits, failed, or only returned weak/unrelated matches,
	// trigger Worldwide Live Web Discovery!
	if err != nil || res == nil || len(res.Results) == 0 || !isStrongMatch(q, res) {
		fmt.Printf("🌐 [Findra Gateway] Local index lacks strong matches for %q. Triggering Worldwide Live Search...\n", q)
		liveItems, liveErr := gw.liveSearch.DiscoverLiveWeb(q, limit)
		if liveErr == nil && len(liveItems) > 0 {
			tookMs := float64(time.Since(startTime).Microseconds()) / 1000.0
			res = &SearchResponse{
				Query:            q,
				InstantAnswer:    instantAns,
				TotalHits:        len(liveItems),
				TookMs:           tookMs,
				Page:             page,
				PageSize:         limit,
				TotalPages:       1,
				Results:          liveItems,
				IsLiveDiscovered: true,
				SourceNotice:     "🌐 Worldwide Web Real-Time Retrieval",
			}

			// Asynchronously auto-index into Findra's local index
			go func(items []SearchResultItem) {
				docsPath := "data/parsed/documents.jsonl"
				crawlPath := "data/raw_crawled/crawl_output.jsonl"
				gw.liveSearch.AutoIndexDiscovered(docsPath, crawlPath, gw.index, items)
				gw.cache.Clear()
			}(liveItems)
		} else if err != nil && instantAns == nil {
			http.Error(w, fmt.Sprintf(`{"error":"Index search failed: %v"}`, err), http.StatusServiceUnavailable)
			return
		} else if res == nil {
			res = &SearchResponse{
				Query:         q,
				InstantAnswer: instantAns,
				TookMs:        float64(time.Since(startTime).Microseconds()) / 1000.0,
				Page:          page,
				PageSize:      limit,
				Results:       []SearchResultItem{},
			}
		}
	}

	if instantAns == nil && res != nil && len(res.Results) > 0 {
		instantAns = ExtractSnippetAIOverview(q, res.Results)
	}

	if instantAns != nil {
		res.InstantAnswer = instantAns
	}

	// Resolve Google/Whoogle-grade rich Knowledge Panel
	knowledgePanel := ResolveKnowledgePanel(q)
	if knowledgePanel != nil && res != nil {
		res.KnowledgePanel = knowledgePanel
	}

	resBytes, err := json.Marshal(res)
	if err == nil {
		gw.cache.Set(cacheKey, resBytes)
	}

	w.Header().Set("X-Cache", "MISS")
	w.Write(resBytes)
}

func isStrongMatch(query string, res *SearchResponse) bool {
	if res == nil || len(res.Results) == 0 {
		return false
	}

	qClean := strings.ToLower(strings.TrimSpace(query))
	queryWords := strings.Fields(qClean)

	top := res.Results[0]
	titleLower := strings.ToLower(top.Title)

	// If top result has high score from navigational brand or BM25F match
	if top.Score >= 15.0 {
		return true
	}

	// Exact match of full query in title is always strong
	if strings.Contains(titleLower, qClean) {
		return true
	}

	// Check title keyword coverage
	titleMatches := 0
	for _, w := range queryWords {
		cleaned := strings.Trim(w, ".,;:!?\"'")
		if len(cleaned) >= 3 && strings.Contains(titleLower, cleaned) {
			titleMatches++
		}
	}

	// For multi-word queries, title MUST contain at least 1 keyword
	if len(queryWords) > 1 {
		if titleMatches > 0 && (top.Score >= 3.0 || top.IsPhraseMatch) {
			return true
		}
		return false
	}

	// For single-word queries, must appear in title or have very high score
	if titleMatches > 0 || (top.Score >= 4.0 && strings.Contains(strings.ToLower(top.Snippet), qClean)) {
		return true
	}

	return false
}

func (gw *APIGateway) handleSuggest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		w.Write([]byte(`{"suggestions":[]}`))
		return
	}

	suggestions, err := gw.index.Suggest(q)
	if err != nil {
		suggestions = []string{}
	}

	resp := map[string]interface{}{
		"query":       q,
		"suggestions": suggestions,
	}
	_ = json.NewEncoder(w).Encode(resp)
}

func (gw *APIGateway) handleStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	stats, err := gw.index.Stats()
	if err != nil {
		stats = map[string]interface{}{
			"index_status": "OFFLINE",
			"error":        err.Error(),
		}
	}

	hits, misses, cachedItems := gw.cache.Stats()
	stats["cache_hits"] = hits
	stats["cache_misses"] = misses
	stats["cache_items"] = cachedItems
	stats["gateway"] = "Go Query API"

	_ = json.NewEncoder(w).Encode(stats)
}

type CrawlRequest struct {
	Seeds             []string `json:"seeds"`
	MaxPages          int      `json:"max_pages"`
	PolitenessDelayMs int      `json:"politeness_delay_ms"`
}

func (gw *APIGateway) handleCrawl(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"POST method required"}`, http.StatusMethodNotAllowed)
		return
	}

	var req CrawlRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	if len(req.Seeds) == 0 {
		req.Seeds = []string{"https://en.wikipedia.org/wiki/Search_engine"}
	}
	if req.MaxPages <= 0 {
		req.MaxPages = 20
	}
	if req.PolitenessDelayMs <= 0 {
		req.PolitenessDelayMs = 400
	}

	go func() {
		_ = globalPipeline.TriggerCrawl(req.Seeds, req.MaxPages, req.PolitenessDelayMs)
	}()

	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":        "ACCEPTED",
		"message":       "Crawl job dispatched in background",
		"max_pages":     req.MaxPages,
		"seeds":         req.Seeds,
	})
}

// SPAServer serves static frontend assets or falls back to index.html
type SPAServer struct {
	staticDir string
}

func (s *SPAServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := filepath.Join(s.staticDir, filepath.Clean(r.URL.Path))
	info, err := os.Stat(path)
	if err == nil && !info.IsDir() {
		http.ServeFile(w, r, path)
		return
	}
	// Fallback to index.html for SPA router
	http.ServeFile(w, r, filepath.Join(s.staticDir, "index.html"))
}

func main() {
	port := flag.Int("port", 8080, "Query API HTTP port")
	rustURL := flag.String("index-url", "http://localhost:8081", "Rust indexer API URL")
	staticDir := flag.String("static-dir", "frontend/dist", "Path to frontend dist directory")
	flag.Parse()

	cfg := ServerConfig{
		Port:         *port,
		RustIndexURL: *rustURL,
		StaticDir:    *staticDir,
		CacheTTL:     10 * time.Minute,
	}

	gw := NewAPIGateway(cfg)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/search", gw.handleSearch)
	mux.HandleFunc("/api/suggest", gw.handleSuggest)
	mux.HandleFunc("/api/stats", gw.handleStats)
	mux.HandleFunc("/api/crawl", gw.handleCrawl)
	mux.HandleFunc("/api/proxy", gw.handleBrowserProxy)
	mux.HandleFunc("/api/reader", gw.handleReaderMode)

	// Serve Frontend UI
	mux.Handle("/", &SPAServer{staticDir: *staticDir})

	addr := fmt.Sprintf(":%d", *port)
	fmt.Println("==================================================")
	fmt.Printf("🚀 FINDRA QUERY API GATEWAY (Go)\n")
	fmt.Printf("   Listening on http://localhost:%d\n", *port)
	fmt.Printf("   Connected to Rust Indexer at: %s\n", *rustURL)
	fmt.Printf("   Serving UI from: %s\n", *staticDir)
	fmt.Println("==================================================")

	srv := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		fmt.Printf("[-] Server error: %v\n", err)
	}
}

