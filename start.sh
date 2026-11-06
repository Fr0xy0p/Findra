#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

mkdir -p logs

echo "=================================================="
echo "🚀 Starting Nexus Search Engine on localhost..."
echo "=================================================="

# Stop any currently running instances
pkill -f "indexer.*8081" 2>/dev/null || true
pkill -f "server_bin.*8080" 2>/dev/null || true

# 1. Start Rust Index Engine
echo "[1/2] Starting Rust Inverted Index Server on :8081..."
nohup ./indexer/target/release/indexer \
  --docs data/parsed/documents.jsonl \
  --pagerank data/parsed/pagerank_scores.json \
  --port 8081 > logs/indexer.log 2>&1 &
INDEXER_PID=$!
echo "      Index Engine PID: $INDEXER_PID"

# Wait briefly for indexer to initialize
for i in {1..10}; do
  if curl -s http://localhost:8081/stats >/dev/null 2>&1; then
    echo "      ✓ Rust Index Engine is ready!"
    break
  fi
  sleep 0.3
done

# 2. Start Go Query API & Web UI Server
echo "[2/2] Starting Go Query Gateway & Web Server on :8080..."
nohup ./server/server_bin \
  --port 8080 \
  --index-url http://localhost:8081 \
  --static-dir frontend/dist > logs/server.log 2>&1 &
SERVER_PID=$!
echo "      Server PID: $SERVER_PID"

# Wait briefly for server to bind
sleep 0.5

echo ""
echo "=================================================="
echo "🎉 WEBSITE IS LIVE!"
echo "👉 Open in your browser: http://localhost:8080"
echo "=================================================="
echo "To view logs: tail -f logs/server.log logs/indexer.log"
echo "To stop:      ./stop.sh"
echo "=================================================="

