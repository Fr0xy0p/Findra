# Multi-stage production container for Findra Search Engine
# Combines Go Server/Crawler, Rust Indexer, C++ PageRank, Python NLP Extractor, and TypeScript UI

# ----------------- STAGE 1: Frontend Build -----------------
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ----------------- STAGE 2: Rust Indexer Build -----------------
FROM rust:1.85-alpine AS rust-builder
RUN apk add --no-cache musl-dev
WORKDIR /app/indexer
COPY indexer/Cargo.* ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release || true
COPY indexer/src ./src
RUN cargo build --release

# ----------------- STAGE 3: Go Server & Crawler Build -----------------
FROM golang:1.24-alpine AS go-builder
WORKDIR /app
COPY crawler/go.mod crawler/
COPY server/go.mod server/
COPY crawler/ crawler/
COPY server/ server/
RUN cd crawler && CGO_ENABLED=0 go build -ldflags="-s -w" -o /app/crawler_bin .
RUN cd server && CGO_ENABLED=0 go build -ldflags="-s -w" -o /app/server_bin .

# ----------------- STAGE 4: C++ PageRank Engine Build -----------------
FROM alpine:3.21 AS cpp-builder
RUN apk add --no-cache g++ make
WORKDIR /app/pagerank
COPY pagerank/pagerank.cpp .
RUN g++ -O3 -std=c++20 pagerank.cpp -o /app/pagerank_engine

# ----------------- STAGE 5: Final Production Image -----------------
FROM python:3.12-alpine
WORKDIR /app

RUN apk add --no-cache bash ca-certificates curl

# Install Python NLP & extraction dependencies
RUN pip install --no-cache-dir beautifulsoup4 requests numpy

# Copy compiled binaries and built frontend
COPY --from=go-builder /app/server_bin ./server_bin
COPY --from=go-builder /app/crawler_bin ./crawler_bin
COPY --from=rust-builder /app/indexer/target/release/indexer ./indexer_bin
COPY --from=cpp-builder /app/pagerank_engine ./pagerank_engine
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy Python scripts and starter data
COPY extractor/ ./extractor/
COPY pagerank/ ./pagerank/
COPY data/ ./data/

# Expose HTTP ports (8080 = Go Gateway, 8081 = Rust Indexer)
EXPOSE 8080 8081

# Startup script to run both Rust index engine and Go Gateway (respects Cloud Run $PORT)
RUN echo '#!/bin/sh\n\
APP_PORT="${PORT:-8080}"\n\
./indexer_bin --docs data/parsed/documents.jsonl --pagerank data/parsed/pagerank_scores.json --port 8081 &\n\
sleep 1\n\
./server_bin --port "${APP_PORT}" --index-url http://localhost:8081 --static-dir frontend/dist\n\
' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

CMD ["/app/entrypoint.sh"]

