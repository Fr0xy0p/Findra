package main

import (
	"compress/gzip"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var (
	browserProxyClient = &http.Client{
		Timeout: 15 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("stopped after 10 redirects")
			}
			return nil
		},
	}

	headRegex      = regexp.MustCompile(`(?i)<head[^>]*>`)
	metaCSPRe      = regexp.MustCompile(`(?i)<meta\s+[^>]*http-equiv=["']?(content-security-policy|x-frame-options)["']?[^>]*>`)
	htmlTagStripRe = regexp.MustCompile(`<[^>]*>`)
	scriptTagRe    = regexp.MustCompile(`(?si)<script[^>]*>.*?</script>`)
	styleTagRe     = regexp.MustCompile(`(?si)<style[^>]*>.*?</style>`)
	navTagRe       = regexp.MustCompile(`(?si)<nav[^>]*>.*?</nav>`)
	headerTagRe    = regexp.MustCompile(`(?si)<header[^>]*>.*?</header>`)
	footerTagRe    = regexp.MustCompile(`(?si)<footer[^>]*>.*?</footer>`)
	asideTagRe     = regexp.MustCompile(`(?si)<aside[^>]*>.*?</aside>`)
	iframeTagRe    = regexp.MustCompile(`(?si)<iframe[^>]*>.*?</iframe>`)
	pTagRegex      = regexp.MustCompile(`(?si)<p[^>]*>(.*?)</p>`)
	titleTagRegex  = regexp.MustCompile(`(?i)<title[^>]*>(.*?)</title>`)
)

type ReaderArticleResponse struct {
	Title        string   `json:"title"`
	Domain       string   `json:"domain"`
	URL          string   `json:"url"`
	ReadingTime  int      `json:"reading_time_minutes"`
	WordCount    int      `json:"word_count"`
	Paragraphs   []string `json:"paragraphs"`
	Excerpt      string   `json:"excerpt"`
}

// handleBrowserProxy proxies the target URL, strips iframe blocking headers,
// injects <base href="...">, and embeds an in-app browser navigation bridge.
func (gw *APIGateway) handleBrowserProxy(w http.ResponseWriter, r *http.Request) {
	rawURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if rawURL == "" {
		http.Error(w, `{"error":"'url' query parameter is required"}`, http.StatusBadRequest)
		return
	}

	if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		rawURL = "https://" + rawURL
	}

	targetURL, err := url.Parse(rawURL)
	if err != nil || targetURL.Host == "" {
		http.Error(w, `{"error":"invalid URL provided"}`, http.StatusBadRequest)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), "GET", targetURL.String(), nil)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to create proxy request: %v"}`, err), http.StatusInternalServerError)
		return
	}

	// Mimic modern Chrome on macOS
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Sec-Ch-Ua", `"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"`)
	req.Header.Set("Sec-Ch-Ua-Mobile", "?0")
	req.Header.Set("Sec-Ch-Ua-Platform", `"macOS"`)
	req.Header.Set("Sec-Fetch-Dest", "document")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	req.Header.Set("Sec-Fetch-Site", "none")
	req.Header.Set("Sec-Fetch-User", "?1")
	req.Header.Set("Upgrade-Insecure-Requests", "1")

	resp, err := browserProxyClient.Do(req)
	if err != nil {
		renderBrowserProxyError(w, targetURL.String(), err)
		return
	}
	defer resp.Body.Close()

	finalURL := resp.Request.URL.String()

	// Strip frame-busting, CSP, and CORS headers
	for k, v := range resp.Header {
		kLower := strings.ToLower(k)
		if kLower == "x-frame-options" ||
			kLower == "content-security-policy" ||
			kLower == "content-security-policy-report-only" ||
			kLower == "cross-origin-embedder-policy" ||
			kLower == "cross-origin-opener-policy" ||
			kLower == "cross-origin-resource-policy" ||
			kLower == "content-length" {
			continue
		}
		for _, val := range v {
			w.Header().Add(k, val)
		}
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("X-Findra-Proxied-URL", finalURL)

	contentType := resp.Header.Get("Content-Type")
	isHTML := strings.Contains(strings.ToLower(contentType), "text/html")

	var reader io.Reader = resp.Body
	if strings.EqualFold(resp.Header.Get("Content-Encoding"), "gzip") {
		gzReader, err := gzip.NewReader(resp.Body)
		if err == nil {
			defer gzReader.Close()
			reader = gzReader
			w.Header().Del("Content-Encoding")
		}
	}

	// For non-HTML assets (images, css, fonts), stream directly
	if !isHTML {
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, reader)
		return
	}

	bodyBytes, err := io.ReadAll(reader)
	if err != nil {
		http.Error(w, "failed to read response body", http.StatusInternalServerError)
		return
	}

	htmlContent := string(bodyBytes)
	modifiedHTML := injectInAppBrowserBridge(htmlContent, finalURL)

	w.Header().Set("Content-Type", "text/html; charset=UTF-8")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write([]byte(modifiedHTML))
}

// injectInAppBrowserBridge injects <base href="..."> and a navigation bridge into the HTML
func injectInAppBrowserBridge(htmlText, finalURL string) string {
	escapedURL := html.EscapeString(finalURL)

	// Strip inline meta CSP or frame-busting tags
	htmlText = metaCSPRe.ReplaceAllString(htmlText, "<!-- meta-csp-stripped -->")

	bridgeScript := fmt.Sprintf(`
<base href="%s">
<script>
(function() {
  // Intercept in-page hyperlink navigation
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (!a || !a.href) return;
    var targetHref = a.href;
    if (targetHref.startsWith('javascript:') || targetHref.startsWith('#')) return;

    try {
      var resolved = new URL(targetHref, document.baseURI).href;
      // Notify parent Findra in-app browser window
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'FINDRA_URL_CHANGE', url: resolved }, '*');
      }
      a.href = '/api/proxy?url=' + encodeURIComponent(resolved);
    } catch(err) {}
  }, true);

  // Notify parent of title and loaded status
  function notifyLoaded() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'FINDRA_PAGE_LOADED',
        title: document.title || "%s",
        url: "%s"
      }, '*');
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    notifyLoaded();
  } else {
    window.addEventListener('DOMContentLoaded', notifyLoaded);
    window.addEventListener('load', notifyLoaded);
  }
})();
</script>
`, escapedURL, escapedURL, escapedURL)

	// Inject right after <head> or at start
	if loc := headRegex.FindStringIndex(htmlText); loc != nil {
		return htmlText[:loc[1]] + bridgeScript + htmlText[loc[1]:]
	}
	return bridgeScript + htmlText
}

// handleReaderMode extracts clean article text, title, and reading time for distraction-free reading
func (gw *APIGateway) handleReaderMode(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	rawURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if rawURL == "" {
		http.Error(w, `{"error":"'url' query parameter is required"}`, http.StatusBadRequest)
		return
	}

	if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		rawURL = "https://" + rawURL
	}

	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" {
		http.Error(w, `{"error":"invalid URL"}`, http.StatusBadRequest)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), "GET", rawURL, nil)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to create request: %v"}`, err), http.StatusInternalServerError)
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

	resp, err := browserProxyClient.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to fetch page: %v"}`, err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	var reader io.Reader = resp.Body
	if strings.EqualFold(resp.Header.Get("Content-Encoding"), "gzip") {
		gzReader, err := gzip.NewReader(resp.Body)
		if err == nil {
			defer gzReader.Close()
			reader = gzReader
		}
	}

	bytes, err := io.ReadAll(reader)
	if err != nil {
		http.Error(w, `{"error":"failed to read page content"}`, http.StatusInternalServerError)
		return
	}

	htmlStr := string(bytes)

	// Extract Title
	title := parsed.Host
	if m := titleTagRegex.FindStringSubmatch(htmlStr); len(m) > 1 {
		cleanTitle := html.UnescapeString(strings.TrimSpace(m[1]))
		if cleanTitle != "" {
			title = cleanTitle
		}
	}

	// Clean scripts, styles, navigation, headers, footers
	sanitized := scriptTagRe.ReplaceAllString(htmlStr, " ")
	sanitized = styleTagRe.ReplaceAllString(sanitized, " ")
	sanitized = navTagRe.ReplaceAllString(sanitized, " ")
	sanitized = headerTagRe.ReplaceAllString(sanitized, " ")
	sanitized = footerTagRe.ReplaceAllString(sanitized, " ")
	sanitized = asideTagRe.ReplaceAllString(sanitized, " ")
	sanitized = iframeTagRe.ReplaceAllString(sanitized, " ")

	// Extract paragraphs with substance (> 40 chars)
	pMatches := pTagRegex.FindAllStringSubmatch(sanitized, -1)
	var paragraphs []string
	totalWords := 0

	for _, p := range pMatches {
		if len(p) > 1 {
			cleaned := htmlTagStripRe.ReplaceAllString(p[1], " ")
			cleaned = html.UnescapeString(cleaned)
			cleaned = strings.TrimSpace(spaceReg.ReplaceAllString(cleaned, " "))
			if len(cleaned) > 40 {
				paragraphs = append(paragraphs, cleaned)
				totalWords += len(strings.Fields(cleaned))
			}
		}
	}

	readingTime := totalWords / 200
	if readingTime < 1 {
		readingTime = 1
	}

	var excerpt string
	if len(paragraphs) > 0 {
		excerpt = paragraphs[0]
		if len(excerpt) > 180 {
			excerpt = excerpt[:180] + "..."
		}
	}

	res := ReaderArticleResponse{
		Title:       title,
		Domain:      parsed.Host,
		URL:         resp.Request.URL.String(),
		ReadingTime: readingTime,
		WordCount:   totalWords,
		Paragraphs:  paragraphs,
		Excerpt:     excerpt,
	}

	_ = json.NewEncoder(w).Encode(res)
}

func renderBrowserProxyError(w http.ResponseWriter, targetURL string, err error) {
	w.Header().Set("Content-Type", "text/html; charset=UTF-8")
	w.WriteHeader(http.StatusBadGateway)
	fmt.Fprintf(w, `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Findra In-App Browser - Could Not Load</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px; max-width: 500px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    h2 { color: #f43f5e; margin-top: 0; font-size: 20px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
    .url { font-family: monospace; background: #0f172a; padding: 6px 12px; border-radius: 6px; font-size: 12px; word-break: break-all; color: #38bdf8; margin: 16px 0; }
    .btn { display: inline-block; background: #2563eb; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500; margin-top: 12px; }
    .btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <h2>🌐 Could Not Load Webpage Inside Findra</h2>
    <p>The target server took too long to respond or refused direct in-app proxying.</p>
    <div class="url">%s</div>
    <a href="%s" target="_blank" rel="noopener noreferrer" class="btn">Open in External Browser Tab ↗</a>
  </div>
</body>
</html>`, html.EscapeString(targetURL), html.EscapeString(targetURL))
}
