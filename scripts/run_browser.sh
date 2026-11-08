#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "$DIR"

echo "=================================================="
echo "🌐 Launching Findra Native Desktop Browser..."
echo "=================================================="

# Check if local Findra backend is running; start if needed
if ! curl -s http://localhost:8080/api/stats >/dev/null 2>&1; then
  echo "[+] Starting local Findra backend services..."
  ./start.sh
  sleep 1
fi

echo "[+] Launching Chromium Desktop Shell..."
cd "$DIR/desktop"
unset ELECTRON_RUN_AS_NODE
npm start
