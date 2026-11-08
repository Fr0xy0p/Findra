#!/bin/sh
set -e

APP_PORT="${PORT:-8080}"

echo "========================================="
echo "🚀 Starting Findra Search Engine in Cloud"
echo "   Gateway Port: ${APP_PORT}"
echo "========================================="

# 1. Start Rust Index Engine in background on port 8081
echo "[1/2] Starting Rust Inverted Index Server on :8081..."
./indexer_bin --docs data/parsed/documents.jsonl --pagerank data/parsed/pagerank_scores.json --port 8081 &

# Wait for indexer to be healthy
echo "Waiting for indexer to load index..."
for i in $(seq 1 30); do
  if curl -s http://localhost:8081/stats >/dev/null 2>&1; then
    echo "✓ Index engine ready!"
    break
  fi
  sleep 0.5
done

# 2. Start Go Gateway & Static Web Server in foreground on $APP_PORT
echo "[2/2] Starting Go Query Gateway & Web Server on :${APP_PORT}..."
exec ./server_bin --port "${APP_PORT}" --index-url http://localhost:8081 --static-dir frontend/dist

