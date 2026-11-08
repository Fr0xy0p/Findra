#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "$DIR"

mkdir -p logs

echo "=================================================="
echo "🌐 Starting Public Cloudflare Tunnel for Findra..."
echo "=================================================="

# Check if Findra local gateway is running
if ! curl -s http://localhost:8080 >/dev/null 2>&1; then
  echo "[-] Local gateway on port 8080 is not running. Starting services first..."
  ./start.sh
fi

# Kill any existing cloudflared tunnels
pkill -f "cloudflared tunnel" 2>/dev/null || true

# Start cloudflared tunnel
cloudflared tunnel --url http://localhost:8080 > logs/tunnel.log 2>&1 &
TUNNEL_PID=$!
echo "Tunnel process started (PID: $TUNNEL_PID)"

# Extract the assigned trycloudflare.com URL
echo "Acquiring public HTTPS URL..."
PUBLIC_URL=""
for i in {1..30}; do
  if [ -f logs/tunnel.log ]; then
    PUBLIC_URL=$(grep -o 'https://[-a-zA-Z0-9\.]*\.trycloudflare\.com' logs/tunnel.log | head -n 1)
    if [ -n "$PUBLIC_URL" ]; then
      break
    fi
  fi
  sleep 0.5
done

if [ -n "$PUBLIC_URL" ]; then
  echo "=================================================="
  echo "🎉 FINDRA IS LIVE ON THE INTERNET!"
  echo "👉 Public HTTPS URL: $PUBLIC_URL"
  echo "=================================================="
  echo "$PUBLIC_URL" > logs/public_url.txt
else
  echo "[-] Could not retrieve tunnel URL in time. Check logs/tunnel.log:"
  cat logs/tunnel.log | tail -n 20
fi

