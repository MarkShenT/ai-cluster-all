#!/bin/bash
# Dual License - AGPL-3.0 or Commercial - Copyright (c) 2025 MarkShenT
# See LICENSE file for details
#===============================================================================
# AI Cluster - macOS Worker Setup Script
#===============================================================================
# This script sets up and runs an AI worker on macOS (Apple Silicon).
#
# SETUP STEPS:
# ============
# 1. Copy these files from ai-cluster project to this Mac:
#    - scripts/setup-worker-macos.sh (this file)
#    - configs/worker-config.template
#
# 2. Rename worker-config.template to worker-config.env
#
# 3. Edit worker-config.env if coordinator IP differs from 10.10.10.75
#    To check coordinator IP from Proxmox host:
#      ssh root@10.10.10.5
#      pct exec 120 -- hostname -I
#
# 4. Run this script:
#    chmod +x setup-worker-macos.sh
#    ./setup-worker-macos.sh
#
# OPTIONS:
#   --no-service    Skip launchd service (manual start only)
#   --uninstall     Remove worker and service
#
# PREREQUISITES:
#   - macOS 12+ (Monterey or later)
#   - Homebrew (will be installed if missing)
#   - Apple Silicon (M1/M2/M3/M4) for Metal support
#
# COORDINATOR INFO:
#   - LXC CTID: 120
#   - Default IP: 10.10.10.75 (NOT the Proxmox host 10.10.10.5!)
#===============================================================================

set -e

# Configuration
SCRIPT_VERSION="1.0.0"
WORKER_DIR="$HOME/.ai-worker"
CONFIG_FILE="worker-config.env"
LAUNCHD_PLIST="$HOME/Library/LaunchAgents/com.user.aiworker.plist"

# Defaults
DEFAULT_COORDINATOR_IP="10.10.10.75"
DEFAULT_COORDINATOR_PORT="80"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

#-------------------------------------------------------------------------------
# Helper Functions
#-------------------------------------------------------------------------------

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${BLUE}→ $1${NC}"; }

show_help() {
    cat << 'EOF'

AI Cluster macOS Worker Setup
==============================

Usage:
    ./setup-worker-macos.sh [options]

Options:
    --no-service    Skip launchd service installation (manual start only)
    --uninstall     Remove worker and launchd service
    --help          Show this help message

The worker will:
1. Install Homebrew (if needed)
2. Install Python 3.11+
3. Install llama-cpp-python with Metal support
4. Download worker.py from coordinator
5. Create launchd service for auto-start

Service Management:
    Start:   launchctl load ~/Library/LaunchAgents/com.user.aiworker.plist
    Stop:    launchctl unload ~/Library/LaunchAgents/com.user.aiworker.plist
    Logs:    tail -f ~/.ai-worker/worker.log
    Status:  launchctl list | grep aiworker

EOF
}

#-------------------------------------------------------------------------------
# Uninstall
#-------------------------------------------------------------------------------

uninstall_worker() {
    echo ""
    print_info "Uninstalling AI Cluster Worker..."
    echo ""

    # Stop and unload service
    if [ -f "$LAUNCHD_PLIST" ]; then
        print_info "Stopping launchd service..."
        launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true
        rm -f "$LAUNCHD_PLIST"
        print_success "Service removed"
    fi

    # Remove worker directory
    if [ -d "$WORKER_DIR" ]; then
        read -p "Remove worker directory and models? ($WORKER_DIR) [y/N]: " confirm
        if [[ "$confirm" =~ ^[Yy]$ ]]; then
            rm -rf "$WORKER_DIR"
            print_success "Worker directory removed"
        else
            print_info "Keeping worker directory"
        fi
    fi

    print_success "Uninstall complete"
    exit 0
}

#-------------------------------------------------------------------------------
# Prerequisites
#-------------------------------------------------------------------------------

check_prerequisites() {
    print_info "Checking prerequisites..."
    echo ""

    # Check macOS version
    local macos_version=$(sw_vers -productVersion)
    local major_version=$(echo "$macos_version" | cut -d. -f1)

    if [ "$major_version" -ge 12 ]; then
        print_success "macOS $macos_version OK"
    else
        print_warning "macOS 12+ recommended, found $macos_version"
    fi

    # Check Apple Silicon
    local arch=$(uname -m)
    if [ "$arch" = "arm64" ]; then
        print_success "Apple Silicon detected (Metal support)"
    else
        print_warning "Intel Mac detected - Metal not available, using CPU"
    fi

    # Check/install Homebrew
    if command -v brew &> /dev/null; then
        print_success "Homebrew installed"
    else
        print_info "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

        # Add to PATH for this session
        if [ -f /opt/homebrew/bin/brew ]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        fi
        print_success "Homebrew installed"
    fi

    # Check/install Python
    if command -v python3 &> /dev/null; then
        local python_version=$(python3 --version | cut -d' ' -f2)
        print_success "Python $python_version installed"
    else
        print_info "Installing Python 3.11..."
        brew install python@3.11
        print_success "Python installed"
    fi

    # Check pip
    if command -v pip3 &> /dev/null; then
        print_success "pip3 available"
    else
        print_error "pip3 not found"
        exit 1
    fi

    echo ""
}

#-------------------------------------------------------------------------------
# Configuration
#-------------------------------------------------------------------------------

load_configuration() {
    print_info "Loading configuration..."

    # Check for config file in current directory or worker directory
    local config_path=""

    if [ -f "$CONFIG_FILE" ]; then
        config_path="$CONFIG_FILE"
    elif [ -f "$WORKER_DIR/$CONFIG_FILE" ]; then
        config_path="$WORKER_DIR/$CONFIG_FILE"
    fi

    if [ -n "$config_path" ]; then
        print_success "Found config: $config_path"

        # Source the config file
        set -a
        source "$config_path"
        set +a
    else
        print_warning "No config file found"
        echo ""

        read -p "Enter Coordinator IP [$DEFAULT_COORDINATOR_IP]: " input_ip
        COORDINATOR_IP=${input_ip:-$DEFAULT_COORDINATOR_IP}
        COORDINATOR_PORT=${COORDINATOR_PORT:-$DEFAULT_COORDINATOR_PORT}

        echo ""
        print_info "API Key is required for worker authentication."
        print_info "Find it in the coordinator's .env file (API_KEY=...)"
        echo ""
        read -p "Enter API Key: " input_api_key
        API_KEY=${input_api_key:-}

        if [ -z "$API_KEY" ]; then
            print_warning "No API key provided - worker may fail to authenticate"
        fi

        # Save config
        mkdir -p "$WORKER_DIR"
        cat > "$WORKER_DIR/$CONFIG_FILE" << EOF
# AI Cluster Worker Configuration
# Generated: $(date)

COORDINATOR_IP=$COORDINATOR_IP
COORDINATOR_PORT=$COORDINATOR_PORT
API_KEY=$API_KEY
WORKER_ID=
GPU_TYPE=metal
WORKER_TYPES=inference
EOF

        print_success "Configuration saved to $WORKER_DIR/$CONFIG_FILE"
    fi

    # Set defaults
    COORDINATOR_IP=${COORDINATOR_IP:-$DEFAULT_COORDINATOR_IP}
    COORDINATOR_PORT=${COORDINATOR_PORT:-$DEFAULT_COORDINATOR_PORT}
    API_KEY=${API_KEY:-}

    # Prompt for API key if not in config
    if [ -z "$API_KEY" ]; then
        echo ""
        print_warning "No API key in config file."
        print_info "API Key is required for worker authentication."
        print_info "Find it in the coordinator's .env file (API_KEY=...)"
        echo ""
        read -p "Enter API Key (or press Enter to skip): " input_api_key
        API_KEY=${input_api_key:-}

        # Update config file with API key if provided
        if [ -n "$API_KEY" ] && [ -f "$WORKER_DIR/$CONFIG_FILE" ]; then
            if grep -q "^API_KEY=" "$WORKER_DIR/$CONFIG_FILE"; then
                sed -i '' "s/^API_KEY=.*/API_KEY=$API_KEY/" "$WORKER_DIR/$CONFIG_FILE"
            else
                echo "API_KEY=$API_KEY" >> "$WORKER_DIR/$CONFIG_FILE"
            fi
            print_success "API key saved to config file"
        fi
    fi

    echo ""
}

#-------------------------------------------------------------------------------
# Setup
#-------------------------------------------------------------------------------

setup_worker_directory() {
    print_info "Setting up worker directory..."

    mkdir -p "$WORKER_DIR"
    mkdir -p "$WORKER_DIR/models"
    mkdir -p "$HOME/Library/LaunchAgents"

    print_success "Worker directory: $WORKER_DIR"
}

install_dependencies() {
    print_info "Installing Python dependencies..."
    echo ""

    # Install llama-cpp-python with Metal support
    print_info "Installing llama-cpp-python (Metal)..."
    echo "This may take several minutes..."

    # Set environment for Metal build
    export CMAKE_ARGS="-DLLAMA_METAL=on"

    pip3 install --upgrade pip

    # Install llama-cpp-python
    pip3 install llama-cpp-python --upgrade --force-reinstall --no-cache-dir

    if python3 -c "import llama_cpp" 2>/dev/null; then
        print_success "llama-cpp-python installed"
    else
        print_error "llama-cpp-python installation failed"
        exit 1
    fi

    # Install other dependencies
    pip3 install requests psutil --upgrade
    print_success "Dependencies installed"

    echo ""
}

download_worker_script() {
    local coordinator_url="http://${COORDINATOR_IP}:${COORDINATOR_PORT}"
    local worker_script_url="${coordinator_url}/setup/worker.py"
    local worker_script_path="$WORKER_DIR/worker.py"

    print_info "Downloading worker.py from $coordinator_url..."

    # Test connectivity
    local health_url="${coordinator_url}/api/v1/system/health"

    if curl -sf "$health_url" > /dev/null 2>&1; then
        print_success "Coordinator is reachable"
    else
        print_error "Cannot connect to coordinator at $coordinator_url"
        echo ""
        echo "Possible issues:"
        echo "  1. Coordinator not running"
        echo "  2. Wrong IP address"
        echo "  3. Network connectivity"
        echo ""
        echo "Test with: curl $health_url"
        echo ""

        # Check for cached script
        if [ -f "$worker_script_path" ]; then
            print_warning "Using cached worker.py (may be outdated)"
            return 0
        else
            exit 1
        fi
    fi

    # Download worker.py
    if curl -sf "$worker_script_url" -o "$worker_script_path"; then
        print_success "worker.py downloaded"
    else
        print_error "Failed to download worker.py"

        if [ -f "$worker_script_path" ]; then
            print_warning "Using cached worker.py"
        else
            exit 1
        fi
    fi
}

create_launchd_service() {
    if [ "$SKIP_SERVICE" = "true" ]; then
        print_info "Skipping launchd service installation (--no-service)"
        return 0
    fi

    print_info "Creating launchd service..."

    local coordinator_url="http://${COORDINATOR_IP}:${COORDINATOR_PORT}"

    cat > "$LAUNCHD_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.aiworker</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>$WORKER_DIR/worker.py</string>
        <string>--coordinator</string>
        <string>$coordinator_url</string>
        <string>--worker-id</string>
        <string>$(hostname -s)</string>
        <string>--gpu-type</string>
        <string>metal</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>API_KEY</key>
        <string>$API_KEY</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>StandardOutPath</key>
    <string>$WORKER_DIR/worker.log</string>

    <key>StandardErrorPath</key>
    <string>$WORKER_DIR/worker.err</string>

    <key>ThrottleInterval</key>
    <integer>30</integer>
</dict>
</plist>
EOF

    print_success "Launchd service created"
}

start_service() {
    if [ "$SKIP_SERVICE" = "true" ]; then
        return 0
    fi

    print_info "Starting launchd service..."

    # Unload if already loaded
    launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true

    # Load service
    launchctl load "$LAUNCHD_PLIST"

    sleep 2

    # Check if running
    if launchctl list | grep -q "com.user.aiworker"; then
        print_success "Worker service started"
    else
        print_warning "Service may not have started - check logs"
    fi
}

print_completion() {
    local coordinator_url="http://${COORDINATOR_IP}:${COORDINATOR_PORT}"

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN} AI Cluster macOS Worker Setup Complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Coordinator: $coordinator_url"
    echo "Worker ID:   $(hostname -s)"
    echo "GPU Type:    Metal (Apple Neural Engine)"
    echo "RAM:         $(( $(sysctl -n hw.memsize) / 1073741824 ))GB"
    echo ""
    echo "Configuration: $WORKER_DIR/$CONFIG_FILE"
    echo ""

    if [ "$SKIP_SERVICE" != "true" ]; then
        echo "Service Management:"
        echo "  Start:   launchctl load $LAUNCHD_PLIST"
        echo "  Stop:    launchctl unload $LAUNCHD_PLIST"
        echo "  Status:  launchctl list | grep aiworker"
        echo ""
        echo "View Logs:"
        echo "  tail -f $WORKER_DIR/worker.log"
        echo "  tail -f $WORKER_DIR/worker.err"
    else
        echo "Manual Start:"
        echo "  python3 $WORKER_DIR/worker.py \\"
        echo "    --coordinator $coordinator_url \\"
        echo "    --worker-id $(hostname -s) \\"
        echo "    --gpu-type metal"
    fi

    echo ""
    echo "To change coordinator IP:"
    echo "  1. Edit $WORKER_DIR/$CONFIG_FILE"
    echo "  2. Update COORDINATOR_IP=<new-ip>"
    echo "  3. Restart service:"
    echo "     launchctl unload $LAUNCHD_PLIST"
    echo "     launchctl load $LAUNCHD_PLIST"
    echo ""
}

#-------------------------------------------------------------------------------
# Main
#-------------------------------------------------------------------------------

main() {
    # Parse arguments
    SKIP_SERVICE="false"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --no-service)
                SKIP_SERVICE="true"
                shift
                ;;
            --uninstall)
                uninstall_worker
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE} AI Cluster macOS Worker Setup${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""

    check_prerequisites
    load_configuration
    setup_worker_directory
    install_dependencies
    download_worker_script
    create_launchd_service
    start_service
    print_completion
}

main "$@"
