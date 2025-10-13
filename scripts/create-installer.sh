#!/bin/bash
set -e

echo "📦 cc-pulse Installer Creator"
echo ""

# Configuration
APP_NAME="cc-pulse"
BUNDLE_ID="com.ccpulse.app"
VERSION="0.1.0"
ARCH=$(uname -m)

# Check for required environment variable
if [ -z "$DEVELOPER_ID_INSTALLER" ]; then
  echo "❌ Error: DEVELOPER_ID_INSTALLER environment variable is not set"
  echo ""
  echo "Set it in .envrc (if using direnv):"
  echo "  export DEVELOPER_ID_INSTALLER='Developer ID Installer: Your Name (TEAMID)'"
  echo ""
  echo "Or set it manually:"
  echo "  export DEVELOPER_ID_INSTALLER='Developer ID Installer: Your Name (TEAMID)'"
  echo "  bash scripts/create-installer.sh"
  echo ""
  exit 1
fi

# Paths
APP_PATH="/Applications/${APP_NAME}.app"
DIST_DIR="$(pwd)/dist"
PKG_NAME="${APP_NAME}-${VERSION}-${ARCH}.pkg"
PKG_PATH="${DIST_DIR}/${PKG_NAME}"
SCRIPTS_DIR="$(pwd)/scripts"
TMP_SCRIPTS_DIR="/tmp/pkg-scripts"

# Step 1: Verify .app bundle exists
echo "🔍 Step 1/5: Verifying .app bundle..."
if [ ! -d "$APP_PATH" ]; then
    echo "❌ Error: App bundle not found at $APP_PATH"
    echo "   Run './scripts/build-release.sh' first"
    exit 1
fi
echo "✅ App bundle found"
echo ""

# Step 2: Prepare postinstall script
echo "📋 Step 2/5: Preparing postinstall script..."
rm -rf "$TMP_SCRIPTS_DIR"
mkdir -p "$TMP_SCRIPTS_DIR"
cp "${SCRIPTS_DIR}/postinstall" "$TMP_SCRIPTS_DIR/"
chmod +x "${TMP_SCRIPTS_DIR}/postinstall"
echo "✅ Postinstall script ready"
echo ""

# Step 3: Create dist directory and temporary root
echo "📁 Step 3/5: Creating dist directory and temporary root..."
mkdir -p "$DIST_DIR"
rm -f "$PKG_PATH"

# Create temporary root directory with only cc-pulse.app
TMP_ROOT="/tmp/cc-pulse-pkg-root"
rm -rf "$TMP_ROOT"
mkdir -p "${TMP_ROOT}/${APP_NAME}.app"
rsync -a "${APP_PATH}/" "${TMP_ROOT}/${APP_NAME}.app/"

echo "✅ Temporary root created"
echo ""

# Step 4: Build package with pkgbuild
echo "🔨 Step 4/5: Building .pkg with pkgbuild..."

# Check for Developer ID Installer certificate
if security find-identity -v -p basic | grep -q "Developer ID Installer"; then
    echo "  ✅ Found Developer ID Installer certificate"
    echo "  Signing with: $DEVELOPER_ID_INSTALLER"
    pkgbuild \
        --root "$TMP_ROOT" \
        --identifier "$BUNDLE_ID" \
        --version "$VERSION" \
        --install-location /Applications \
        --scripts "$TMP_SCRIPTS_DIR" \
        --sign "$DEVELOPER_ID_INSTALLER" \
        "$PKG_PATH"
# Fallback: Try with Developer ID Application
elif security find-identity -v -p basic | grep -q "Developer ID Application"; then
    DEVELOPER_ID_APPLICATION=$(security find-identity -v -p basic | grep "Developer ID Application" | head -1 | sed -E 's/.*"(.*)"/\1/')
    echo "  ℹ️  Developer ID Installer not found"
    echo "  🔄 Attempting to sign with Developer ID Application:"
    echo "     $DEVELOPER_ID_APPLICATION"

    if pkgbuild \
        --root "$TMP_ROOT" \
        --identifier "$BUNDLE_ID" \
        --version "$VERSION" \
        --install-location /Applications \
        --scripts "$TMP_SCRIPTS_DIR" \
        --sign "$DEVELOPER_ID_APPLICATION" \
        "$PKG_PATH" 2>/dev/null; then
        echo "  ✅ Successfully signed with Developer ID Application!"
    else
        echo "  ⚠️  Developer ID Application cannot sign .pkg"
        echo "  Creating unsigned package..."
        pkgbuild \
            --root "$TMP_ROOT" \
            --identifier "$BUNDLE_ID" \
            --version "$VERSION" \
            --install-location /Applications \
            --scripts "$TMP_SCRIPTS_DIR" \
            "$PKG_PATH"
    fi
else
    echo "  ⚠️  No Developer ID certificate found"
    echo "  Creating unsigned package..."
    pkgbuild \
        --root "$TMP_ROOT" \
        --identifier "$BUNDLE_ID" \
        --version "$VERSION" \
        --install-location /Applications \
        --scripts "$TMP_SCRIPTS_DIR" \
        "$PKG_PATH"
fi

# Cleanup temporary root
rm -rf "$TMP_ROOT"

echo "✅ Package created: $PKG_PATH"
echo ""

# Step 5: Notarization (optional)
if [ "$CERT_EXISTS" = true ]; then
    echo "📝 Step 5/5: Notarization options"
    echo ""
    echo "To notarize this package, run:"
    echo "  xcrun notarytool submit \"$PKG_PATH\" \\"
    echo "    --apple-id \"YOUR_APPLE_ID@example.com\" \\"
    echo "    --team-id \"YOUR_TEAM_ID\" \\"
    echo "    --password \"<app-specific-password>\""
    echo ""
    echo "After notarization succeeds, staple the ticket:"
    echo "  xcrun stapler staple \"$PKG_PATH\""
    echo ""
else
    echo "📝 Step 5/5: Notarization skipped (no certificate)"
    echo ""
    echo "⚠️  To enable signing and notarization:"
    echo "  1. Create Developer ID Installer certificate at:"
    echo "     https://developer.apple.com/account/resources/certificates"
    echo "  2. Generate App-Specific Password at:"
    echo "     https://appleid.apple.com"
    echo "  3. Re-run this script"
    echo ""
fi

# Cleanup
rm -rf "$TMP_SCRIPTS_DIR"

# Summary
echo "✅ Installer creation complete!"
echo ""
echo "Package location: $PKG_PATH"
echo "Package size: $(du -h "$PKG_PATH" | cut -f1)"
echo ""
echo "To install:"
echo "  sudo installer -pkg \"$PKG_PATH\" -target /"
echo ""
