#!/bin/bash
set -e

echo "🚀 cc-pulse installer"
echo ""

# Configuration
VERSION="0.1.0"
GITHUB_USER="yourusername"  # TODO: Update with actual GitHub username
GITHUB_REPO="cc-pulse"

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    PKG_FILE="cc-pulse-${VERSION}-arm64.pkg"
else
    PKG_FILE="cc-pulse-${VERSION}-x64.pkg"
fi

# Construct download URL
PKG_URL="https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases/download/v${VERSION}/${PKG_FILE}"
TMP_PKG="/tmp/cc-pulse.pkg"

# Check macOS version
MACOS_VERSION=$(sw_vers -productVersion | cut -d. -f1)
if [ "$MACOS_VERSION" -lt 13 ]; then
    echo "❌ Error: macOS 13 or later is required"
    echo "   Your version: $(sw_vers -productVersion)"
    exit 1
fi

# Download package
echo "📥 Downloading cc-pulse ${VERSION} for ${ARCH}..."
echo "   From: $PKG_URL"
echo ""

if ! curl -L -f -o "$TMP_PKG" "$PKG_URL"; then
    echo ""
    echo "❌ Download failed"
    echo ""
    echo "Please check:"
    echo "  - Internet connection"
    echo "  - Release exists at: https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases"
    exit 1
fi

echo "✅ Download complete"
echo ""

# Install package
echo "📦 Installing cc-pulse..."
echo "   (This will prompt for your password)"
echo ""

if sudo installer -pkg "$TMP_PKG" -target /; then
    echo ""
    echo "✅ Installation complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Run setup:          cc-pulse setup"
    echo "  2. Configure schedule: cc-pulse schedule"
    echo "  3. Start using:        cc-pulse fetch"
    echo ""
    echo "For more information:"
    echo "  cc-pulse --help"
    echo ""
else
    echo ""
    echo "❌ Installation failed"
    echo ""
    echo "Please check the error message above"
    exit 1
fi

# Cleanup
rm -f "$TMP_PKG"
