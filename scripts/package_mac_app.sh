#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "$DIR"

echo "=================================================="
echo "📦 Packaging Findra as a Native macOS Application..."
echo "=================================================="

SRC_APP="$DIR/desktop/node_modules/electron/dist/Electron.app"
BUILD_DIR="$DIR/dist"
TARGET_APP="$BUILD_DIR/Findra.app"

if [ ! -d "$SRC_APP" ]; then
  echo "[-] Electron base app not found at $SRC_APP. Please run npm install in desktop/"
  exit 1
fi

# Ensure build_assets/Findra.icns exists
if [ ! -f "$DIR/build_assets/Findra.icns" ]; then
  echo "[+] Generating macOS Retina App Icons..."
  cd "$DIR/desktop"
  unset ELECTRON_RUN_AS_NODE
  ./node_modules/.bin/electron ../scripts/generate_mac_app.js
  cd "$DIR"
fi

echo "[1/5] Creating clean app bundle structure..."
mkdir -p "$BUILD_DIR"
rm -rf "$TARGET_APP"
cp -R "$SRC_APP" "$TARGET_APP"

echo "[2/5] Configuring Info.plist metadata..."
PLIST="$TARGET_APP/Contents/Info.plist"
plutil -replace CFBundleDisplayName -string "Findra" "$PLIST"
plutil -replace CFBundleName -string "Findra" "$PLIST"
plutil -replace CFBundleExecutable -string "Findra" "$PLIST"
plutil -replace CFBundleIdentifier -string "com.findra.browser" "$PLIST"
plutil -replace CFBundleIconFile -string "Findra.icns" "$PLIST"
plutil -remove ElectronAsarIntegrity "$PLIST" 2>/dev/null || true

echo "[3/5] Setting up binary and application payload..."
mv "$TARGET_APP/Contents/MacOS/Electron" "$TARGET_APP/Contents/MacOS/Findra-bin"
cat << 'EOF' > "$TARGET_APP/Contents/MacOS/Findra"
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
unset ELECTRON_RUN_AS_NODE
exec "$DIR/Findra-bin" "$@"
EOF
chmod +x "$TARGET_APP/Contents/MacOS/Findra" "$TARGET_APP/Contents/MacOS/Findra-bin"

# Replace Icons
cp "$DIR/build_assets/Findra.icns" "$TARGET_APP/Contents/Resources/Findra.icns"
cp "$DIR/build_assets/Findra.icns" "$TARGET_APP/Contents/Resources/electron.icns"

# Inject Findra Browser application code
APP_RES_DIR="$TARGET_APP/Contents/Resources/app"
rm -rf "$APP_RES_DIR" "$TARGET_APP/Contents/Resources/default_app.asar"
mkdir -p "$APP_RES_DIR"

cp "$DIR/desktop/package.json" "$APP_RES_DIR/"
cp "$DIR/desktop/main.js" "$APP_RES_DIR/"
cp "$DIR/desktop/preload.js" "$APP_RES_DIR/"
cp "$DIR/desktop/tab-preload.js" "$APP_RES_DIR/"
cp -R "$DIR/desktop/ui" "$APP_RES_DIR/"

echo "[4/5] Ad-hoc signing app bundle with macOS codesign..."
codesign --force --deep --sign - "$TARGET_APP"

echo "[5/5] Installing Findra into Applications folder..."
INSTALL_DEST="/Applications/Findra.app"
USER_DEST="$HOME/Applications/Findra.app"

if [ -w "/Applications" ]; then
  rm -rf "$INSTALL_DEST"
  cp -R "$TARGET_APP" "$INSTALL_DEST"
  touch "$INSTALL_DEST"
  FINAL_APP="$INSTALL_DEST"
  # Refresh LaunchServices database
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$INSTALL_DEST" 2>/dev/null || true
else
  mkdir -p "$HOME/Applications"
  rm -rf "$USER_DEST"
  cp -R "$TARGET_APP" "$USER_DEST"
  touch "$USER_DEST"
  FINAL_APP="$USER_DEST"
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$USER_DEST" 2>/dev/null || true
fi

echo ""
echo "=================================================="
echo "🎉 SUCCESS: FINDRA IS INSTALLED AS A REAL MAC APPLICATION!"
echo "📍 Location: $FINAL_APP"
echo "🚀 You can now find it in Launchpad, Spotlight (Cmd+Space -> Findra), or Applications!"
echo "=================================================="
