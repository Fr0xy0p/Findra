package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

type SearchResultItem struct {
	DocID           uint32   `json:"doc_id"`
	URL             string   `json:"url"`
	Domain          string   `json:"domain"`
	Title           string   `json:"title"`
	Snippet         string   `json:"snippet"`
	Score           float64  `json:"score"`
	BM25Score       float64  `json:"bm25_score"`
	PageRankScore   float64  `json:"pagerank_score"`
	TrustRankScore  float64  `json:"trustrank_score,omitempty"`
	DocLength       uint32   `json:"doc_length"`
	Headings        []string `json:"headings"`
	IsPhraseMatch   bool     `json:"is_phrase_match,omitempty"`
	MatchedInAnchor bool     `json:"matched_in_anchor,omitempty"`
}

type KnowledgePanel struct {
	Title        string            `json:"title"`
	Type         string            `json:"type,omitempty"`
	Description  string            `json:"description,omitempty"`
	ImageURL     string            `json:"image_url,omitempty"`
	Website      string            `json:"website,omitempty"`
	WikipediaURL string            `json:"wikipedia_url,omitempty"`
	Attributes   map[string]string `json:"attributes,omitempty"`
	Source       string            `json:"source,omitempty"`
}

type SearchResponse struct {
	Query            string             `json:"query"`
	DidYouMean       string             `json:"did_you_mean,omitempty"`
	InstantAnswer    *InstantAnswer     `json:"instant_answer,omitempty"`
	KnowledgePanel   *KnowledgePanel    `json:"knowledge_panel,omitempty"`
	TotalHits        int                `json:"total_hits"`
	TookMs           float64            `json:"took_ms"`
	Page             int                `json:"page"`
	PageSize         int                `json:"page_size"`
	TotalPages       int                `json:"total_pages"`
	Results          []SearchResultItem `json:"results"`
	IsLiveDiscovered bool               `json:"is_live_discovered,omitempty"`
	SourceNotice     string             `json:"source_notice,omitempty"`
}

type IndexClient struct {
	baseURL string
	client  *http.Client
}

func NewIndexClient(baseURL string) *IndexClient {
	return &IndexClient{
		baseURL: baseURL,
		client: &http.Client{
			Timeout: 3 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 50,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}
}

func (c *IndexClient) Search(query string, page, limit int) (*SearchResponse, error) {
	reqURL := fmt.Sprintf("%s/search?q=%s&page=%d&limit=%d",
		c.baseURL, url.QueryEscape(query), page, limit)

	resp, err := c.client.Get(reqURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("index server returned status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var searchRes SearchResponse
	if err := json.Unmarshal(body, &searchRes); err != nil {
		return nil, err
	}

	return &searchRes, nil
}

func (c *IndexClient) Suggest(query string) ([]string, error) {
	reqURL := fmt.Sprintf("%s/suggest?q=%s", c.baseURL, url.QueryEscape(query))
	resp, err := c.client.Get(reqURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var res struct {
		Suggestions []string `json:"suggestions"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}

	return res.Suggestions, nil
}

func (c *IndexClient) Stats() (map[string]interface{}, error) {
	resp, err := c.client.Get(c.baseURL + "/stats")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var stats map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		return nil, err
	}

	return stats, nil
}

func (c *IndexClient) Reload() error {
	resp, err := c.client.Post(c.baseURL+"/reload", "application/json", nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("reload failed with HTTP status: %d", resp.StatusCode)
	}
	return nil
}

