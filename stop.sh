#!/bin/bash
echo "Stopping Findra Search Engine..."
pkill -f "indexer.*8081" 2>/dev/null && echo "✓ Rust Indexer stopped" || echo "- Rust Indexer was not running"
pkill -f "server_bin.*8080" 2>/dev/null && echo "✓ Go Server stopped" || echo "- Go Server was not running"
echo "All services stopped."

