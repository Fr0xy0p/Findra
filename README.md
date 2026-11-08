# Findra Browser & Search Engine

[![Download for Windows](https://img.shields.io/badge/Download_for_Windows-ZIP-0078d4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Fr0xy0p/Findra/releases/latest/download/Findra-1.0.0-win.zip)
[![Download for macOS](https://img.shields.io/badge/Download_for_macOS-DMG-0284c7?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/Fr0xy0p/Findra/releases/latest/download/Findra-mac-arm64.dmg)
[![Live Cloud App](https://img.shields.io/badge/Live_Cloud_Web-Online-10b981?style=for-the-badge&logo=render&logoColor=white)](https://findra-q4pt.onrender.com/)
[![GitHub Release](https://img.shields.io/github/v/release/Fr0xy0p/Findra?style=for-the-badge&color=8b5cf6)](https://github.com/Fr0xy0p/Findra/releases/latest)

> **Findra** is an AI-enhanced native desktop browser and production-grade search engine with a polyglot architecture (Rust Inverted Index + Go Gateway + React TypeScript UI).

---

## 📥 Download & Install Findra (Windows & Mac)

Anyone can download and install Findra directly from GitHub Releases:

| Platform | Installer | Architecture | Download Link |
| :--- | :--- | :--- | :--- |
| **Windows** | **Windows ZIP Package** | x64 (64-bit) | [**Download Findra-1.0.0-win.zip**](https://github.com/Fr0xy0p/Findra/releases/latest/download/Findra-1.0.0-win.zip) |
| **macOS** | **macOS Disk Image (.dmg)** | Apple Silicon (M1/M2/M3/M4) | [**Download Findra-mac-arm64.dmg**](https://github.com/Fr0xy0p/Findra/releases/latest/download/Findra-mac-arm64.dmg) |
| **macOS** | **macOS Zip Archive (.zip)** | Apple Silicon (M1/M2/M3/M4) | [**Download Findra-mac-arm64.zip**](https://github.com/Fr0xy0p/Findra/releases/latest/download/Findra-mac-arm64.zip) |
| **Any Device** | **Live Web App (Cloud)** | Browser / Mobile | [**Open findra-q4pt.onrender.com**](https://findra-q4pt.onrender.com/) |

### Quick Installation:

#### On Windows:
1. Download [**`Findra-1.0.0-win.zip`**](https://github.com/Fr0xy0p/Findra/releases/latest/download/Findra-1.0.0-win.zip).
2. Extract the ZIP archive anywhere on your PC.
3. Double-click **`Findra.exe`** to launch Findra Browser!

#### On macOS:
1. Download [**`Findra-mac-arm64.dmg`**](https://github.com/Fr0xy0p/Findra/releases/latest/download/Findra-mac-arm64.dmg).
2. Double-click the downloaded `.dmg` file and drag **Findra.app** into your **Applications** folder.
3. Launch Findra from **Spotlight** (`Cmd + Space` → `Findra`) or **Launchpad**!

> **macOS Gatekeeper Note**: On first launch, macOS may show a prompt stating the app is from an unidentified developer. Simply **right-click Findra.app** in Finder / Applications and select **Open** (or click **Open Anyway** in *System Settings > Privacy & Security*).

---

A production-grade, polite web search engine built from first principles following the exact polyglot industry-standard architecture:

- **Phase 1 & 2: Polite Web Crawler** in **Go** (Goroutines, Robots.txt compliance, URL frontier with BFS & deduplication, per-domain rate limiting).
- **Phase 2 & 3: HTML Parsing & Text Extraction** in **Python** (BeautifulSoup, Clean Text extraction, Hyperlink graph extraction).
- **Phase 3: NLP & Text Processing** in **Python** (Unicode NFKD normalization, tokenization, stop-word elimination, Porter Stemming).
- **Phase 3 & 6: Link Graph & PageRank Engine** in **C++20** (High-throughput sparse matrix power iteration with damping factor $d = 0.85$, handling dangling nodes and $L_1$ convergence tracking).
- **Phase 4 & 5: Inverted Index & Scoring** in **Rust** (Memory-safe, zero GC pause, VByte/Varint compressed posting lists, Okapi BM25 scoring with $k_1 = 1.2, b = 0.75$).
- **Phase 7 & 8: Multi-Signal Hybrid Ranker & LTR** in **Rust / Python** (BM25 text relevance + normalized PageRank authority + exact title match boost + URL depth score).
- **Phase 4 & 5: Query API & Serving Gateway** in **Go** (High concurrency, sub-millisecond LRU query cache, REST API, SPA server).
- **Phase 4 & 5: Search Interface** in **TypeScript & React (Vite + Tailwind)** (Google/Brave style omnibar with real-time suggestions, search results with highlighted snippet terms, knowledge card, and live crawling trigger modal).

---

## 🏛️ Architecture Diagram

```
 [ World Wide Web ]
         │
         ▼ (Polite Go HTTP Fetcher & robots.txt)
 [ Go Web Crawler ] ─────────► [ data/raw_crawled/crawl_output.jsonl ]
                                             │
                                             ▼
                              [ Python HTML Extractor & Porter Stemmer ]
                                             │
                       ┌─────────────────────┴──────────────────────┐
                       ▼                                            ▼
           [ data/parsed/documents.jsonl ]           [ data/parsed/link_graph.json ]
                       │                                            │
                       │                                            ▼ (C++20 Power Iteration)
                       │                              [ C++ PageRank Engine ]
                       │                                            │
                       ▼                                            ▼
               ┌────────────────────────────────────────────────────────┐
               │    Rust Inverted Index Engine (Port 8081)              │
               │  - Lexicon & Varint Posting Lists                      │
               │  - Okapi BM25 Term Weighting                           │
               │  - Context-Aware Snippet Generation                    │
               │  - Autocomplete Prefix Trie                            │
               └────────────────────────────────────────────────────────┘
                                      ▲
                                      │ Sub-millisecond Fan-out (HTTP / RPC)
                                      ▼
               ┌────────────────────────────────────────────────────────┐
               │    Go Serving API Gateway (Port 8080)                  │
               │  - In-Memory / Redis LRU Query Cache (X-Cache: HIT)    │
               │  - On-Demand Live Crawl Dispatcher                     │
               │  - REST API (/api/search, /api/suggest, /api/stats)    │
               └────────────────────────────────────────────────────────┘
                                      ▲
                                      │ Fast JSON Requests
                                      ▼
               ┌────────────────────────────────────────────────────────┐
               │   TypeScript + React Search UI (Google/Brave Style)   │
               │  - Real-time Omnibar Autocomplete                      │
               │  - Bold Snippet Highlighting & Breadcrumbs             │
               │  - Right Knowledge Overview Panel                      │
               │  - Dark / Light Theme & Live Crawler Modal             │
               └────────────────────────────────────────────────────────┘
```

---

## 📐 Algorithmic Foundations

### 1. Okapi BM25 Text Relevance
For query $Q$ with terms $q_1, \dots, q_n$ and document $D$:
$$\text{BM25}(D, Q) = \sum_{i=1}^n \text{IDF}(q_i) \cdot \frac{f(q_i, D) \cdot (k_1 + 1)}{f(q_i, D) + k_1 \cdot \left(1 - b + b \cdot \frac{|D|}{\text{avgdl}}\right)}$$
with Robertson-Sparck Jones IDF:
$$\text{IDF}(q_i) = \ln\left(1 + \frac{N - n(q_i) + 0.5}{n(q_i) + 0.5}\right)$$
Parameters: $k_1 = 1.2$, $b = 0.75$, $N$ = total documents, $\text{avgdl}$ = corpus average document length.

### 2. PageRank Authority Power Iteration
For directed link graph with $N$ nodes, damping factor $d = 0.85$, and dangling node set $\mathcal{D}$:
$$P^{(t+1)}(v) = \frac{1 - d}{N} + \frac{d}{N} \sum_{u \in \mathcal{D}} P^{(t)}(u) + d \sum_{u \in \text{In}(v)} \frac{P^{(t)}(u)}{\text{OutDegree}(u)}$$
Iterates until convergence: $\|P^{(t+1)} - P^{(t)}\|_1 < 10^{-7}$.

### 3. Multi-Signal Hybrid Ranker
$$\text{FinalScore}(D, Q) = 0.55 \cdot \text{BM25} + 0.20 \cdot (\text{PageRank} \cdot 10) + 0.15 \cdot \text{TitleMatch} + 0.05 \cdot \frac{1}{1 + \text{depth}} + 0.05 \cdot \text{TermCoverage}$$

---

## 🚀 Quickstart (Local Run)

### Prerequisites
- Go 1.22+
- Rust & Cargo 1.80+
- Python 3.10+
- Node.js 20+ & npm
- C++20 compiler (`clang++` or `g++`)

### 1. Build All Components
```bash
make build-all
```

### 2. Run Pipeline (Crawl, Parse, PageRank, Index)
```bash
# 1. Polite Go Crawler fetches initial seeds
make crawl

# 2. Python HTML parser and Porter stemmer
make parse

# 3. C++ PageRank power iteration
make pagerank
```

### 3. Start Search Engine
```bash
make serve
```
Open **[http://localhost:8080](http://localhost:8080)** in your browser!

---

## 📡 API Reference

### 1. Search Query
`GET /api/search?q={query}&page=1&limit=10`
```json
{
  "query": "search engine",
  "total_hits": 14,
  "took_ms": 0.042,
  "page": 1,
  "page_size": 10,
  "total_pages": 2,
  "results": [
    {
      "doc_id": 5,
      "url": "https://en.wikipedia.org/wiki/Search_engine",
      "domain": "en.wikipedia.org",
      "title": "Search engine - Wikipedia",
      "snippet": "A search engine is an information retrieval software system...",
      "score": 2.179,
      "bm25_score": 0.809,
      "pagerank_score": 0.137,
      "doc_length": 6078,
      "headings": ["History", "Technology", "Market share"]
    }
  ]
}
```

### 2. Autocomplete Suggestions
`GET /api/suggest?q={prefix}`
```json
{
  "query": "page",
  "suggestions": [
    "PageRank - Wikipedia",
    "pagerank",
    "pages",
    "pagination"
  ]
}
```

### 3. Engine Statistics
`GET /api/stats`
```json
{
  "total_documents": 20,
  "total_terms": 8605,
  "avg_doc_length": 2790.35,
  "index_status": "ONLINE",
  "gateway": "Go Query API",
  "cache_hits": 42,
  "cache_items": 15
}
```

### 4. Trigger Live Web Crawl
`POST /api/crawl`
```json
{
  "seeds": ["https://en.wikipedia.org/wiki/Search_engine"],
  "max_pages": 30,
  "politeness_delay_ms": 400
}
```

---

## 🌐 1-Click Free Cloud Deployment (Zero Local Hosting)

Deploy Findra permanently online 24/7 in the cloud so you can access it from any browser, phone, or Mac without keeping your terminal or laptop running!

### Option 1: Render (100% Free, Recommended)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Fr0xy0p/Findra)

1. Open [Render Dashboard](https://dashboard.render.com).
2. Sign in with GitHub (`Fr0xy0p`).
3. Click **New +** → **Web Service** → Connect your repository `Fr0xy0p/Findra`.
4. Select runtime **Docker** (it automatically uses `Dockerfile` and `render.yaml`).
5. Choose the **Free** instance plan and click **Create Web Service**.
6. Render builds the multi-stage container and assigns you a permanent HTTPS URL (e.g. `https://findra.onrender.com`).

### Option 2: Railway
1. Open [Railway.app](https://railway.app).
2. Click **New Project** → **Deploy from GitHub repo** → select `Findra`.
3. Railway automatically detects `railway.json` / `Dockerfile` and deploys your live service.

### Option 3: Connect Findra Desktop App to Your Live Cloud URL
Inside `/Applications/Findra.app`:
- Click the **Cloud** button on the toolbar (or press `Cmd + ,`).
- Paste your live cloud URL (e.g. `https://findra.onrender.com`).
- Click **Save & Connect**! The browser will now always connect directly to your live cloud server with zero localhost needed.

---

## ☁️ Google Cloud Run Deployment

Follow these step-by-step instructions:

### Step 1: Ensure Google Cloud SDK is Authenticated
```bash
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID
```

### Step 2: Build & Deploy Container to Cloud Run
Deploy directly from source using the multi-stage `Dockerfile`:
```bash
gcloud run deploy findra-search \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 2
```

### Step 3: Access Live URL
Google Cloud Run will print the production URL:
```
Service [findra-search] revision has been deployed and is serving 100 percent of traffic.
Service URL: https://findra-search-xxxxx-uc.a.run.app
```
Both the Go Serving Gateway, Rust Inverted Index, and TypeScript frontend are served live in high-performance production mode!

