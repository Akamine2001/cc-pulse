#!/bin/bash
#
# CC Pulse Setup Script for Google Jules VM
#
# This script sets up cc-pulse in a clean Ubuntu VM environment.
# It installs all dependencies, downloads the embedding model,
# and generates sample data for testing.
#
# Usage:
#   bash setup-jules.sh
#
# Prerequisites:
#   - Ubuntu Linux (Jules VM)
#   - Internet connection
#   - CLAUDE_CODE_OAUTH_TOKEN environment variable (optional, for Claude Agent SDK)
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

# Main setup function
main() {
    log_step "CC Pulse Setup for Google Jules VM"

    # Check OS
    if [[ ! -f /etc/os-release ]]; then
        error_exit "Cannot detect OS. This script is designed for Linux (Ubuntu)."
    fi

    . /etc/os-release
    log_info "OS: $NAME $VERSION"
    log_info "Architecture: $(uname -m)"
    echo ""

    # Check prerequisites
    check_prerequisites

    # Install Bun
    install_bun

    # Install uv
    install_uv

    # Setup project
    setup_project

    # Create directories
    create_directories

    # Create config file
    create_config

    # Setup Python environment
    setup_python_environment

    # Download embedding model
    download_embedding_model

    # Initialize database
    initialize_database

    # Generate sample data
    generate_sample_data

    # Build frontend CSS
    build_frontend_css

    # Start web server
    start_web_server

    # Final message
    show_completion_message
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

    # Check Python
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 --version | awk '{print $2}')
        log_success "Python $PYTHON_VERSION is installed"
    else
        error_exit "Python 3 is not installed. Please install it first: sudo apt-get install python3"
    fi

    # Check git
    if command -v git &> /dev/null; then
        log_success "git is installed"
    else
        error_exit "git is not installed. Please install it first: sudo apt-get install git"
    fi

    # Check if project directory exists
    if [[ ! -f "package.json" ]]; then
        error_exit "package.json not found. Please run this script from the project root directory."
    fi

    log_success "All prerequisites are met"
}

# Install Bun
install_bun() {
    log_step "Step 2: Installing Bun Runtime"

    if command -v bun &> /dev/null; then
        BUN_VERSION=$(bun --version)
        log_info "Bun is already installed: v$BUN_VERSION"

        # Get actual Bun path and set BUN_INSTALL for consistency
        BUN_PATH=$(which bun)
        BUN_DIR=$(dirname "$BUN_PATH")
        export BUN_INSTALL=$(dirname "$BUN_DIR")
        export PATH="$BUN_INSTALL/bin:$PATH"

        log_success "Using existing Bun installation: $BUN_PATH"
        return
    fi

    log_info "Downloading and installing Bun..."
    curl -fsSL https://bun.sh/install | bash

    # Add Bun to PATH for current session
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    # Verify installation
    if command -v bun &> /dev/null; then
        BUN_VERSION=$(bun --version)
        log_success "Bun v$BUN_VERSION installed successfully"
    else
        error_exit "Bun installation failed"
    fi
}

# Install uv
install_uv() {
    log_step "Step 3: Installing uv (Python Package Manager)"

    if command -v uv &> /dev/null; then
        UV_VERSION=$(uv --version | awk '{print $2}')
        log_info "uv is already installed: v$UV_VERSION"
        log_info "Skipping installation..."
        return
    fi

    log_info "Downloading and installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh

    # Add uv to PATH for current session
    export PATH="$HOME/.local/bin:$PATH"

    # Verify installation
    if command -v uv &> /dev/null; then
        UV_VERSION=$(uv --version | awk '{print $2}')
        log_success "uv v$UV_VERSION installed successfully"
    else
        error_exit "uv installation failed"
    fi
}

# Setup project dependencies
setup_project() {
    log_step "Step 4: Installing Project Dependencies"

    # Install Node.js dependencies with Bun
    log_info "Installing Node.js dependencies..."
    bun install
    log_success "Node.js dependencies installed"

    log_info "Project setup complete"
}

# Create directories
create_directories() {
    log_step "Step 5: Creating Directory Structure"

    # Config directory
    CONFIG_DIR="$HOME/.config/cc-pulse"
    mkdir -p "$CONFIG_DIR"
    log_success "Created: $CONFIG_DIR"

    # Data directory
    DATA_DIR="$HOME/.local/share/cc-pulse"
    mkdir -p "$DATA_DIR/news"
    log_success "Created: $DATA_DIR/news"

    # Database and model directory
    DB_STATE_DIR="$HOME/.cc-pulse"
    mkdir -p "$DB_STATE_DIR"
    log_success "Created: $DB_STATE_DIR"

    # Model directory
    MODEL_DIR="$DB_STATE_DIR/models"
    mkdir -p "$MODEL_DIR"
    log_success "Created: $MODEL_DIR"

    # Logs directory (XDG compliant)
    LOGS_STATE_DIR="$HOME/.local/state/cc-pulse"
    LOGS_DIR="$LOGS_STATE_DIR/logs"
    mkdir -p "$LOGS_DIR"
    log_success "Created: $LOGS_DIR"
}

# Create config file
create_config() {
    log_step "Step 6: Creating Configuration File"

    CONFIG_FILE="$HOME/.config/cc-pulse/config.yml"

    if [[ -f "$CONFIG_FILE" ]]; then
        log_warn "Config file already exists: $CONFIG_FILE"
        log_info "Skipping config creation..."
        return
    fi

    log_info "Creating default config file..."

    cat > "$CONFIG_FILE" << 'EOF'
# cc-pulse configuration

# Keywords for news collection
keywords:
  - AI
  - Machine Learning
  - Claude

# Target article count
count: 5

# Language
language: ja

# Web server port
port: 5775

# Scheduler settings (not used in Jules)
scheduler:
  enabled: false
  time: "09:00"
  pattern: daily
  custom_days: []
  auto_start_webui: false
EOF

    log_success "Config file created: $CONFIG_FILE"
}

# Setup Python environment
setup_python_environment() {
    log_step "Step 7: Setting up Python Environment"

    # Change to mcp directory
    cd mcp

    log_info "Installing Python dependencies with uv..."
    uv sync

    log_success "Python environment ready"

    # Return to project root
    cd ..
}

# Download embedding model
download_embedding_model() {
    log_step "Step 8: Downloading EmbeddingGemma Model"

    log_info "Model: onnx-community/embeddinggemma-300m-ONNX"
    log_info "Size: ~188MB"
    log_warn "This may take a few minutes..."
    echo ""

    # Change to mcp directory
    cd mcp

    # Run download script
    uv run python download_model.py

    log_success "Embedding model downloaded"

    # Return to project root
    cd ..
}

# Initialize database
initialize_database() {
    log_step "Step 9: Initializing SQLite Database"

    DB_PATH="$HOME/.cc-pulse/articles.db"

    if [[ -f "$DB_PATH" ]]; then
        log_info "Database already exists: $DB_PATH"
        log_info "Skipping initialization..."
        return
    fi

    log_info "Creating database schema..."

    # Change to mcp directory
    cd mcp

    # Initialize database by importing db module
    uv run python -c "from db import get_article_db; db = get_article_db(); print('Database initialized')"

    log_success "Database initialized: $DB_PATH"

    # Return to project root
    cd ..
}

# Generate sample data
generate_sample_data() {
    log_step "Step 10: Generating Sample Data"

    log_info "Generating sample news articles with embeddings..."
    echo ""

    # Change to mcp directory
    cd mcp

    # Run sample data generator
    uv run python generate_sample_data.py

    log_success "Sample data generated"

    # Return to project root
    cd ..
}

# Build frontend CSS
build_frontend_css() {
    log_step "Step 10.5: Building Frontend CSS"

    log_info "Building Tailwind CSS..."
    bun run build:css

    CSS_OUTPUT_FILE="src/templates/styles.built.css"
    if [[ -f "$CSS_OUTPUT_FILE" ]]; then
        log_success "CSS build complete: $CSS_OUTPUT_FILE"
    else
        log_error "CSS build failed. File not found: $CSS_OUTPUT_FILE"
        return 1
    fi
}

# Start web server
start_web_server() {
    log_step "Step 11: Starting Web Server"

    log_info "Stopping any existing server to prevent port conflicts..."
    pkill -f 'bun run dev serve' &>/dev/null || true
    sleep 1 # Give a moment for the port to be released

    log_info "Starting web server on http://localhost:5775..."

    # Get Bun path dynamically
    BUN_PATH=$(which bun)
    if [[ -z "$BUN_PATH" ]]; then
        log_error "Bun command not found. Please check Bun installation."
        return 1
    fi

    log_info "Using Bun: $BUN_PATH"

    # Start server in background with dynamic bun path
    nohup "$BUN_PATH" run dev serve > "$HOME/.local/state/cc-pulse/logs/server.log" 2>&1 &
    SERVER_PID=$!

    # Wait a moment for server to start
    sleep 3

    # Check if server is running
    if kill -0 $SERVER_PID 2>/dev/null; then
        log_success "Web server started (PID: $SERVER_PID)"
        echo -e "  Log file: $HOME/.local/state/cc-pulse/logs/server.log"
    else
        log_error "Failed to start web server"
        log_info "Check logs: $HOME/.local/state/cc-pulse/logs/server.log"

        # Show last 20 lines of log for debugging
        if [[ -f "$HOME/.local/state/cc-pulse/logs/server.log" ]]; then
            echo ""
            log_warn "Last 20 lines of server log:"
            tail -n 20 "$HOME/.local/state/cc-pulse/logs/server.log"
        fi

        return 1
    fi
}

# Show completion message
show_completion_message() {
    echo ""
    echo -e "${GREEN}=====================================${NC}"
    echo -e "${GREEN}Setup Complete!${NC}"
    echo -e "${GREEN}=====================================${NC}"
    echo ""
    echo -e "${CYAN}Environment Summary:${NC}"
    echo -e "  Bun version:    $(bun --version)"
    echo -e "  uv version:     $(uv --version | awk '{print $2}')"
    echo -e "  Python version: $(python3 --version | awk '{print $2}')"
    echo ""
    echo -e "${CYAN}Directory Structure:${NC}"
    echo -e "  Config:   $HOME/.config/cc-pulse/config.yml"
    echo -e "  Data:     $HOME/.local/share/cc-pulse/news/"
    echo -e "  Database: $HOME/.cc-pulse/articles.db"
    echo -e "  Models:   $HOME/.cc-pulse/models/"
    echo ""
    echo -e "${GREEN}Web UI Access:${NC}"
    echo -e "  ${GREEN}Open your browser and go to:${NC}"
    echo -e "  ${CYAN}http://localhost:5775${NC}"
    echo ""
    echo -e "${CYAN}Server Control:${NC}"
    echo -e "  Stop server:  ${GRAY}pkill -f 'bun run dev serve'${NC}"
    echo -e "  View logs:    ${GRAY}tail -f ~/.local/state/cc-pulse/logs/server.log${NC}"
    echo ""
    echo -e "${CYAN}Additional Commands:${NC}"
    echo -e "  Fetch new articles:  ${GRAY}bun run dev fetch${NC}"
    echo -e "  Restart server:      ${GRAY}bun run dev serve${NC}"
    echo ""
    echo -e "${YELLOW}Note:${NC} Sample data includes 3 collections with 15 total articles."
    echo -e "${YELLOW}Note:${NC} CLAUDE_CODE_OAUTH_TOKEN is required for fetching new articles."
    echo ""

    # Check for CLAUDE_CODE_OAUTH_TOKEN
    if [[ -z "${CLAUDE_CODE_OAUTH_TOKEN}" ]]; then
        log_warn "CLAUDE_CODE_OAUTH_TOKEN is not set"
        echo -e "       Set it in Jules UI if you want to fetch real news articles."
    else
        log_success "CLAUDE_CODE_OAUTH_TOKEN is set"
    fi

    echo ""
    echo -e "${GREEN}=====================================${NC}"
}

# Run main function
main "$@"
