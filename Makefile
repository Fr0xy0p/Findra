.PHONY: all build build-all crawl parse pagerank index serve dev clean test

# Default target
all: build-all

# Build all microservices
build-all: build-crawler build-extractor build-pagerank build-indexer build-server build-frontend

build-crawler:
	@echo "==> Building Go Crawler..."
	@cd crawler && go build -o crawler_bin .

build-extractor:
	@echo "==> Setting up Python virtual environment..."
	@python3 -m venv .venv
	@.venv/bin/pip install -q beautifulsoup4 requests numpy

build-pagerank:
	@echo "==> Compiling C++ PageRank Engine..."
	@clang++ -O3 -std=c++20 pagerank/pagerank.cpp -o pagerank/pagerank_engine

build-indexer:
	@echo "==> Compiling Rust Inverted Index Server..."
	@cd indexer && cargo build --release

build-server:
	@echo "==> Building Go API Gateway..."
	@cd server && go build -o server_bin .

build-frontend:
	@echo "==> Building TypeScript / React Frontend..."
	@cd frontend && npm install && npm run build

# Run pipeline step-by-step
crawl:
	@echo "==> Launching Polite Go Web Crawler..."
	@./crawler/crawler_bin --seeds data/seeds.txt --max-pages 25 --delay-ms 300 --output data/raw_crawled/crawl_output.jsonl

parse:
	@echo "==> Running Python HTML Extractor & Porter Stemmer..."
	@.venv/bin/python3 extractor/run_pipeline.py --input data/raw_crawled/crawl_output.jsonl --output data/parsed

pagerank:
	@echo "==> Running C++ Sparse Matrix PageRank..."
	@./pagerank/pagerank_engine data/parsed/link_graph.json data/parsed/pagerank_scores.json

serve-indexer:
	@echo "==> Starting Rust Indexer on port 8081..."
	@./indexer/target/release/indexer --docs data/parsed/documents.jsonl --pagerank data/parsed/pagerank_scores.json --port 8081

serve-gateway:
	@echo "==> Starting Go API Gateway on port 8080..."
	@./server/server_bin --port 8080 --index-url http://localhost:8081 --static-dir frontend/dist

serve:
	@echo "==> Starting Search Engine (Rust Indexer + Go Gateway)..."
	@./indexer/target/release/indexer --docs data/parsed/documents.jsonl --pagerank data/parsed/pagerank_scores.json --port 8081 & \
	PID_INDEXER=$$!; \
	sleep 1; \
	./server/server_bin --port 8080 --index-url http://localhost:8081 --static-dir frontend/dist; \
	kill $$PID_INDEXER 2>/dev/null || true

dev-frontend:
	@cd frontend && npm run dev

clean:
	@rm -rf crawler/crawler_bin server/server_bin pagerank/pagerank_engine frontend/dist indexer/target

