#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "$DIR"

VERSION="${1:-v1.0.0}"

echo "=================================================="
echo "🚀 Creating Findra macOS Release Assets ($VERSION)..."
echo "=================================================="

# 1. Ensure Mac App is packaged
./scripts/package_mac_app.sh

# 2. Create DMG and ZIP archives
echo "[1/2] Building DMG and ZIP distribution archives..."
mkdir -p "$DIR/dist"
hdiutil create -volname "Findra" -srcfolder "$DIR/dist/Findra.app" -ov -format UDZO "$DIR/dist/Findra-mac-arm64.dmg"
ditto -c -k --sequesterRsrc --keepParent "$DIR/dist/Findra.app" "$DIR/dist/Findra-mac-arm64.zip"

echo "[2/2] Publishing Release to GitHub ($VERSION)..."
gh release create "$VERSION" "$DIR/dist/Findra-mac-arm64.dmg" "$DIR/dist/Findra-mac-arm64.zip" \
  --title "Findra Browser $VERSION (macOS)" \
  --notes "## 🎉 Findra Browser $VERSION for macOS

Findra is an AI-enhanced native web browser and search engine powered by a polyglot search architecture (Rust Inverted Index + Go Gateway).

### 📦 Installation
1. Download **Findra-mac-arm64.dmg** (or **Findra-mac-arm64.zip**) below.
2. Open the DMG and drag **Findra.app** into your **Applications** folder.
3. Open Findra from Spotlight (Cmd+Space -> Findra) or Launchpad!
" || gh release upload "$VERSION" "$DIR/dist/Findra-mac-arm64.dmg" "$DIR/dist/Findra-mac-arm64.zip" --clobber

echo ""
echo "=================================================="
echo "🎉 RELEASE PUBLISHED SUCCESSFULLY!"
echo "👉 https://github.com/Fr0xy0p/Findra/releases"
echo "=================================================="

