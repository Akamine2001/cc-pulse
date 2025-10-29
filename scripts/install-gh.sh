#!/bin/bash
#
# GitHub CLI (gh) Installation Script for macOS
#
# This script installs GitHub CLI (gh) on macOS using Homebrew.
# If Homebrew is not installed, it will be installed first.
#
# Usage:
#   bash scripts/install-gh.sh
#
# Prerequisites:
#   - macOS (10.15 or later)
#   - Internet connection
#   - Administrator privileges (for Homebrew installation)
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo ""
    echo -e "${CYAN}=====================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}=====================================${NC}"
}

# Error handler
error_exit() {
    log_error "$1"
    exit 1
}

# Check if running on macOS
check_macos() {
    log_step "Checking Operating System"

    if [[ "$(uname)" != "Darwin" ]]; then
        error_exit "This script is designed for macOS only. Detected: $(uname)"
    fi

    MACOS_VERSION=$(sw_vers -productVersion)
    log_success "Running on macOS $MACOS_VERSION"
}

# Install Homebrew if not present
install_homebrew() {
    log_step "Step 1: Checking Homebrew"

    if command -v brew &> /dev/null; then
        BREW_VERSION=$(brew --version | head -n 1)
        log_success "Homebrew is already installed: $BREW_VERSION"

        # Update Homebrew
        log_info "Updating Homebrew..."
        brew update
        log_success "Homebrew updated"
        return
    fi

    log_info "Homebrew not found. Installing..."
    log_warn "You may be prompted for your password (administrator privileges required)"
    echo ""

    # Install Homebrew
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Detect architecture and add Homebrew to PATH
    if [[ "$(uname -m)" == "arm64" ]]; then
        # Apple Silicon
        BREW_PATH="/opt/homebrew/bin/brew"
        if [[ -f "$BREW_PATH" ]]; then
            eval "$($BREW_PATH shellenv)"
            log_info "Added Homebrew to PATH (Apple Silicon)"
        fi
    else
        # Intel
        BREW_PATH="/usr/local/bin/brew"
        if [[ -f "$BREW_PATH" ]]; then
            eval "$($BREW_PATH shellenv)"
            log_info "Added Homebrew to PATH (Intel)"
        fi
    fi

    # Verify installation
    if command -v brew &> /dev/null; then
        BREW_VERSION=$(brew --version | head -n 1)
        log_success "Homebrew installed successfully: $BREW_VERSION"
    else
        error_exit "Homebrew installation failed. Please install manually: https://brew.sh"
    fi
}

# Install GitHub CLI
install_gh() {
    log_step "Step 2: Installing GitHub CLI (gh)"

    if command -v gh &> /dev/null; then
        GH_VERSION=$(gh --version | head -n 1)
        log_success "GitHub CLI is already installed: $GH_VERSION"

        # Upgrade gh if a newer version is available
        log_info "Checking for updates..."
        brew upgrade gh || log_info "GitHub CLI is up to date"

        GH_VERSION=$(gh --version | head -n 1)
        log_success "Current version: $GH_VERSION"
        return
    fi

    log_info "Installing GitHub CLI via Homebrew..."
    brew install gh

    # Verify installation
    if command -v gh &> /dev/null; then
        GH_VERSION=$(gh --version | head -n 1)
        log_success "GitHub CLI installed successfully: $GH_VERSION"
    else
        error_exit "GitHub CLI installation failed"
    fi
}

# Check authentication status
check_auth() {
    log_step "Step 3: Checking GitHub Authentication"

    if gh auth status &> /dev/null; then
        log_success "GitHub CLI is authenticated"
        echo ""
        gh auth status
    else
        log_warn "GitHub CLI is not authenticated"
        echo ""
        echo -e "${CYAN}To authenticate with GitHub, run:${NC}"
        echo -e "  ${GRAY}gh auth login${NC}"
        echo ""
        echo -e "${CYAN}Or to authenticate with a token:${NC}"
        echo -e "  ${GRAY}gh auth login --with-token < token.txt${NC}"
    fi
}

# Show completion message
show_completion() {
    echo ""
    echo -e "${GREEN}=====================================${NC}"
    echo -e "${GREEN}Installation Complete!${NC}"
    echo -e "${GREEN}=====================================${NC}"
    echo ""
    echo -e "${CYAN}GitHub CLI Version:${NC}"
    gh --version
    echo ""
    echo -e "${CYAN}Common Commands:${NC}"
    echo -e "  Authenticate:     ${GRAY}gh auth login${NC}"
    echo -e "  Create PR:        ${GRAY}gh pr create${NC}"
    echo -e "  List PRs:         ${GRAY}gh pr list${NC}"
    echo -e "  View PR:          ${GRAY}gh pr view <number>${NC}"
    echo -e "  Create issue:     ${GRAY}gh issue create${NC}"
    echo -e "  Clone repo:       ${GRAY}gh repo clone <owner/repo>${NC}"
    echo ""
    echo -e "${CYAN}Documentation:${NC}"
    echo -e "  Manual:           ${GRAY}gh help${NC}"
    echo -e "  Online docs:      ${GRAY}https://cli.github.com/manual/${NC}"
    echo ""
    echo -e "${GREEN}=====================================${NC}"
}

# Main function
main() {
    log_step "GitHub CLI Installation for macOS"

    check_macos
    install_homebrew
    install_gh
    check_auth
    show_completion
}

# Run main function
main "$@"
