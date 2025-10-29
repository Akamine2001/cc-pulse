#!/bin/bash
#
# GitHub CLI (gh) Installation Script for Linux
#
# This script installs GitHub CLI (gh) on Linux (Ubuntu/Debian).
#
# Usage:
#   bash scripts/install-gh.sh
#
# Prerequisites:
#   - Ubuntu/Debian Linux
#   - Internet connection
#   - sudo privileges
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

# Check if running on Linux
check_linux() {
    log_step "Checking Operating System"

    if [[ "$(uname)" != "Linux" ]]; then
        error_exit "This script is designed for Linux only. Detected: $(uname)"
    fi

    if [[ ! -f /etc/os-release ]]; then
        error_exit "Cannot detect OS. /etc/os-release not found."
    fi

    . /etc/os-release
    log_success "Running on $NAME $VERSION"
}

# Check prerequisites
check_prerequisites() {
    log_step "Step 1: Checking Prerequisites"

    # Check curl
    if command -v curl &> /dev/null; then
        log_success "curl is installed"
    else
        error_exit "curl is not installed. Please install it first: sudo apt-get install curl"
    fi

    # Check sudo
    if ! sudo -n true 2>/dev/null; then
        log_warn "sudo privileges required. You may be prompted for your password."
    else
        log_success "sudo privileges confirmed"
    fi

    log_success "All prerequisites are met"
}

# Install GitHub CLI
install_gh() {
    log_step "Step 2: Installing GitHub CLI (gh)"

    if command -v gh &> /dev/null; then
        GH_VERSION=$(gh --version | head -n 1)
        log_success "GitHub CLI is already installed: $GH_VERSION"

        # Upgrade gh if a newer version is available
        log_info "Checking for updates..."
        sudo apt-get update &> /dev/null
        sudo apt-get install --only-upgrade gh -y &> /dev/null || log_info "GitHub CLI is up to date"

        GH_VERSION=$(gh --version | head -n 1)
        log_success "Current version: $GH_VERSION"
        return
    fi

    log_info "Adding GitHub CLI repository..."

    # Add GitHub CLI repository
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null
    sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null

    log_success "Repository added"

    log_info "Installing GitHub CLI..."
    sudo apt-get update
    sudo apt-get install gh -y

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
    log_step "GitHub CLI Installation for Linux"

    check_linux
    check_prerequisites
    install_gh
    check_auth
    show_completion
}

# Run main function
main "$@"
