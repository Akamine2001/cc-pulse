#!/bin/bash
set -e
set -x  # デバッグモード：実行されるコマンドを表示

echo "🚀 cc-pulse Release Builder"
echo "DEBUG: Script started at $(date)"
echo ""

# Configuration
APP_NAME="cc-pulse"
BUNDLE_ID="com.ccpulse.app"

# Check for required environment variable
if [ -z "$DEVELOPER_ID" ]; then
  echo "❌ Error: DEVELOPER_ID environment variable is not set"
  echo ""
  echo "Set it in .envrc (if using direnv):"
  echo "  export DEVELOPER_ID='Developer ID Application: Your Name (TEAMID)'"
  echo ""
  echo "Or set it manually:"
  echo "  export DEVELOPER_ID='Developer ID Application: Your Name (TEAMID)'"
  echo "  bash scripts/build-release.sh"
  echo ""
  exit 1
fi

APP_PATH="/Applications/${APP_NAME}.app"

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  BUILD_ARCH="arm64"
else
  BUILD_ARCH="x64"
fi

echo "📦 Architecture: $BUILD_ARCH"
echo ""

# Step 1: Clean previous build
echo "🧹 Step 1/7: Cleaning previous build..."
echo "DEBUG: Removing $APP_PATH"
rm -rf "$APP_PATH"
echo "DEBUG: Removing dist/"
rm -rf dist/
echo "DEBUG: Clean complete"

# Step 2: Build TypeScript CLI binary
echo ""
echo "🔨 Step 2/7: Building CLI binary..."
echo "DEBUG: Running bun run build:${BUILD_ARCH}"
bun run build:${BUILD_ARCH}
echo "DEBUG: Bun build complete"

if [ ! -f "dist/${APP_NAME}-darwin-${BUILD_ARCH}" ]; then
  echo "❌ Binary build failed"
  exit 1
fi

echo "✅ CLI binary built"
echo "DEBUG: Binary path: dist/${APP_NAME}-darwin-${BUILD_ARCH}"

# Step 3: Build Swift registration helper
echo ""
echo "🔨 Step 3/7: Building Swift registration helper..."
echo "DEBUG: Running swiftc..."
swiftc -O \
  -o /tmp/${APP_NAME}-register \
  swift/LoginItemRegistration/main.swift
echo "DEBUG: Swift build complete"

if [ ! -f "/tmp/${APP_NAME}-register" ]; then
  echo "❌ Swift helper build failed"
  exit 1
fi

echo "✅ Swift helper built"
echo "DEBUG: Helper path: /tmp/${APP_NAME}-register"

# Step 4: Create .app bundle structure
echo ""
echo "📁 Step 4/7: Creating .app bundle structure..."
echo "DEBUG: App path: $APP_PATH"

CONTENTS_DIR="${APP_PATH}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"

echo "DEBUG: Creating directories: $MACOS_DIR, $RESOURCES_DIR"
mkdir -p "$MACOS_DIR"
mkdir -p "$RESOURCES_DIR"
echo "DEBUG: Directories created"

# Copy binaries
echo "DEBUG: Copying CLI binary..."
cp "dist/${APP_NAME}-darwin-${BUILD_ARCH}" "${MACOS_DIR}/${APP_NAME}"
echo "DEBUG: Copying registration helper..."
cp "/tmp/${APP_NAME}-register" "${MACOS_DIR}/${APP_NAME}-register"

# Set executable permissions
echo "DEBUG: Setting permissions..."
chmod +x "${MACOS_DIR}/${APP_NAME}"
chmod +x "${MACOS_DIR}/${APP_NAME}-register"

# Copy Info.plist
echo "DEBUG: Copying Info.plist..."
cp "src/templates/MainApp-Info.plist" "${CONTENTS_DIR}/Info.plist"
echo "DEBUG: Info.plist copied"

# Copy app icon
echo "DEBUG: Copying AppIcon.icns..."
cp "src/templates/AppIcon.icns" "${RESOURCES_DIR}/AppIcon.icns"
echo "DEBUG: AppIcon.icns copied"

echo "✅ Bundle structure created"
echo ""

# Step 5: Sign .app bundle
echo ""
echo "✍️  Step 5/7: Signing with Developer ID..."
echo "DEBUG: Developer ID: $DEVELOPER_ID"
echo "DEBUG: Signing $APP_PATH (this may prompt for keychain password)..."

# Sign without hardened runtime (for compatibility with Bun binaries)
# Note: Hardened runtime is required for notarization, but causes issues with Bun
codesign --force --deep \
  --sign "$DEVELOPER_ID" \
  --timestamp \
  "$APP_PATH" 2>&1

echo "DEBUG: Signing complete"
echo "✅ Signed with Developer ID"
echo ""

# Step 6: Verify signature
echo ""
echo "🔍 Step 6/7: Verifying signature..."
echo "DEBUG: Running codesign --verify..."

if codesign --verify --deep --strict --verbose=2 "$APP_PATH" 2>&1; then
  echo "DEBUG: Verification passed"
  echo "✅ Signature verified"
else
  echo "DEBUG: Verification failed"
  echo "❌ Signature verification failed"
  exit 1
fi

echo ""

# Step 7: Display signature info
echo "📋 Step 7/7: Signature information:"
echo "DEBUG: Getting signature details..."
codesign -dvvv "$APP_PATH" 2>&1 | grep -E "(Identifier|Authority|TeamIdentifier)"

echo ""
echo "DEBUG: Script completed at $(date)"
echo "✅ Build complete!"
echo ""
echo "Next steps:"
echo "  1. Test locally: /Applications/cc-pulse.app/Contents/MacOS/cc-pulse --version"
echo "  2. Notarize: ./scripts/notarize.sh"
echo "  3. Create distribution: ./scripts/create-distribution.sh"
echo ""
echo "DEBUG: Exiting script"
