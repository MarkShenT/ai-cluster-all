#!/bin/bash
# Dual License - AGPL-3.0 or Commercial - Copyright (c) 2025 MarkShenT
# See LICENSE file for details
#===============================================================================
# AI Cluster - Master Setup Script
#===============================================================================
# This script sets up the AI Cluster coordinator in LXC 10.10.10.75 (CTID: 120)
# Run this script INSIDE the LXC container, not on the Proxmox host.
#
# DEPLOYMENT STEPS:
# =================
# 1. From your Mac, copy project to Proxmox Node 1:
#    scp -r /path/to/ai-cluster root@10.10.10.5:/tmp/
#
# 2. SSH to Proxmox host:
#    ssh root@10.10.10.5
#
# 3. Deploy to LXC (run the helper script):
#    cd /tmp/ai-cluster
#    ./scripts/deploy-to-lxc.sh
#
# 4. Or manually copy and enter LXC:
#    cd /tmp && tar czf ai-cluster.tar.gz ai-cluster
#    pct push 120 /tmp/ai-cluster.tar.gz /opt/ai-cluster.tar.gz
#    pct exec 120 -- tar xzf /opt/ai-cluster.tar.gz -C /opt/
#    pct exec 120 -- rm /opt/ai-cluster.tar.gz
#    pct enter 120
#    cd /opt/ai-cluster && ./setup.sh
#
# Usage: ./setup.sh
#===============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DEFAULT_COORDINATOR_IP="10.10.10.75"
DEFAULT_COORDINATOR_PORT="80"
DEFAULT_API_VERSION="v1"
DEFAULT_MODEL="34b"
DEFAULT_RETENTION_DAYS="30"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

#-------------------------------------------------------------------------------
# Helper Functions
#-------------------------------------------------------------------------------

print_header() {
    echo -e "${BLUE}"
    echo "==============================================================================="
    echo " AI Cluster Setup"
    echo "==============================================================================="
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}→ $1${NC}"
}

check_prerequisites() {
    echo ""
    echo "Checking prerequisites..."

    # Check Docker
    if command -v docker &> /dev/null; then
        print_success "Docker installed ($(docker --version | cut -d' ' -f3 | tr -d ','))"
    else
        print_error "Docker not installed"
        echo "Please install Docker first: apt install docker.io"
        exit 1
    fi

    # Check Docker Compose
    if docker compose version &> /dev/null; then
        print_success "Docker Compose installed ($(docker compose version --short))"
    else
        print_error "Docker Compose not installed"
        echo "Please install Docker Compose: apt install docker-compose-plugin"
        exit 1
    fi

    # Check Git
    if command -v git &> /dev/null; then
        print_success "Git installed ($(git --version | cut -d' ' -f3))"
    else
        print_warning "Git not installed (optional)"
    fi

    # Check if running in LXC
    if [ -f /proc/1/environ ] && grep -q container=lxc /proc/1/environ 2>/dev/null; then
        print_success "Running inside LXC container"
    else
        print_warning "May not be running in LXC container"
    fi
}

detect_ip() {
    # Try to detect the IP address
    local detected_ip=""

    # Method 1: hostname -I (first IP)
    if command -v hostname &> /dev/null; then
        detected_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi

    # Method 2: ip addr (fallback)
    if [ -z "$detected_ip" ] && command -v ip &> /dev/null; then
        detected_ip=$(ip -4 addr show scope global | grep inet | head -1 | awk '{print $2}' | cut -d/ -f1)
    fi

    echo "$detected_ip"
}

configure_network() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE} LXC Container IP Configuration${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "IMPORTANT: This setup runs INSIDE an LXC container on Proxmox."
    echo "The LXC has its own IP address (different from Proxmox host)."
    echo ""

    local detected_ip=$(detect_ip)

    if [ -n "$detected_ip" ]; then
        echo "Detected IP: $detected_ip"
        echo ""
        read -p "Is $detected_ip the correct coordinator LXC IP? [Y/n]: " confirm
        confirm=${confirm:-Y}

        if [[ "$confirm" =~ ^[Yy]$ ]]; then
            COORDINATOR_IP="$detected_ip"
        else
            read -p "Enter coordinator LXC IP address: " COORDINATOR_IP
        fi
    else
        print_warning "Could not detect IP address"
        read -p "Enter coordinator LXC IP address [$DEFAULT_COORDINATOR_IP]: " COORDINATOR_IP
        COORDINATOR_IP=${COORDINATOR_IP:-$DEFAULT_COORDINATOR_IP}
    fi

    echo ""
    echo -e "${YELLOW}CRITICAL: Workers must connect to this LXC IP ($COORDINATOR_IP),${NC}"
    echo -e "${YELLOW}NOT the Proxmox host IP (10.10.10.5)${NC}"
    echo ""
}

configure_options() {
    echo ""
    echo "Configuration Options:"
    echo ""

    # Download initial model
    read -p "Download 34B model on first start? [Y/n]: " download_model
    download_model=${download_model:-Y}
    if [[ "$download_model" =~ ^[Yy]$ ]]; then
        INITIAL_MODEL_DOWNLOAD="true"
    else
        INITIAL_MODEL_DOWNLOAD="false"
    fi

    # API version
    read -p "API version [$DEFAULT_API_VERSION]: " api_version
    API_VERSION=${api_version:-$DEFAULT_API_VERSION}

    echo ""
    print_info "Generating security credentials..."

    # Generate API key (REQUIRED for authentication) - 64 char hex string
    # Using head -c to avoid pipe buffering issues
    API_KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
    print_success "API_KEY generated"

    # Generate secret key for Flask sessions - 64 char hex string
    SECRET_KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
    print_success "SECRET_KEY generated"

    # Generate Redis password - 32 char hex string
    REDIS_PASSWORD=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
    print_success "REDIS_PASSWORD generated"

    echo ""
    echo -e "${YELLOW}IMPORTANT: Save your API_KEY for worker configuration:${NC}"
    echo -e "${GREEN}  API_KEY=$API_KEY${NC}"
    echo ""
    echo "You will need this key to configure workers."
    echo "It is also saved in .env file."
    echo ""
}

generate_env_file() {
    echo ""
    print_info "Generating .env file..."

    cat > "$SCRIPT_DIR/.env" << EOF
#===============================================================================
# AI Cluster Configuration
# Generated: $(date)
#===============================================================================

#-------------------------------------------------------------------------------
# NETWORK CONFIGURATION
#-------------------------------------------------------------------------------
# USING EXISTING LXC: $COORDINATOR_IP (internal-docker)
#
# Proxmox Node 1 host IP: 10.10.10.5 (DO NOT USE THIS)
# Coordinator LXC IP: $COORDINATOR_IP (USE THIS)
#
COORDINATOR_IP=$COORDINATOR_IP
COORDINATOR_PORT=$DEFAULT_COORDINATOR_PORT

#-------------------------------------------------------------------------------
# SECURITY CONFIGURATION (AUTO-GENERATED)
#-------------------------------------------------------------------------------
# API Key - Required for all API requests (except health check)
# Share this with workers in their worker-config.env file
API_KEY=$API_KEY

# Redis password - Internal Redis authentication
REDIS_PASSWORD=$REDIS_PASSWORD

# Allowed subnet - Only IPs from this subnet can access
ALLOWED_SUBNET=10.10.10.0/24

# Auth disabled flag - ONLY set to 'true' for testing (NOT RECOMMENDED)
AUTH_DISABLED=false

#-------------------------------------------------------------------------------
# COORDINATOR CONFIGURATION
#-------------------------------------------------------------------------------
API_VERSION=$API_VERSION
FLASK_ENV=production
SECRET_KEY=$SECRET_KEY

# Redis
REDIS_URL=redis://redis:6379

# Database
DATABASE_URL=sqlite:////data/jobs.db

# Storage Paths (inside Docker containers)
MODELS_PATH=/models
RESULTS_PATH=/results
PROJECTS_PATH=/projects

#-------------------------------------------------------------------------------
# APPLICATION SETTINGS
#-------------------------------------------------------------------------------
DEFAULT_MODEL=$DEFAULT_MODEL
RESULT_RETENTION_DAYS=$DEFAULT_RETENTION_DAYS
PROJECT_RETENTION_DAYS=90
MAX_CONCURRENT_JOBS=3
MAX_PROJECT_SIZE_MB=100
ENABLE_WEBSOCKET_PROGRESS=true
WORKER_HEARTBEAT_TIMEOUT=120

#-------------------------------------------------------------------------------
# MODEL DOWNLOAD
#-------------------------------------------------------------------------------
INITIAL_MODEL_DOWNLOAD=$INITIAL_MODEL_DOWNLOAD
HUGGINGFACE_TOKEN=

#-------------------------------------------------------------------------------
# LOGGING
#-------------------------------------------------------------------------------
LOG_LEVEL=INFO
EOF

    print_success ".env created with security credentials"
}

generate_worker_config_template() {
    echo ""
    print_info "Generating worker-config.template..."

    cat > "$SCRIPT_DIR/configs/worker-config.template" << EOF
#===============================================================================
# AI Cluster Worker Configuration
# Generated: $(date)
#===============================================================================
#
# IMPORTANT: Copy this file to each worker machine as 'worker-config.env'
# You MUST set the API_KEY to match the coordinator's .env file
#
# Current Network: $(echo $COORDINATOR_IP | cut -d. -f1-3).x
# Coordinator: http://$COORDINATOR_IP
#
#===============================================================================

# Coordinator connection (LXC IP, not Proxmox host IP!)
COORDINATOR_IP=$COORDINATOR_IP
COORDINATOR_PORT=$DEFAULT_COORDINATOR_PORT

# API Authentication (REQUIRED - copy from coordinator's .env file)
# Get this value from: $COORDINATOR_IP:/opt/ai-cluster/.env
API_KEY=COPY_API_KEY_FROM_COORDINATOR_ENV_FILE

# Worker identification (leave empty to auto-detect from hostname)
WORKER_ID=

# Worker capabilities (detected automatically, but can override)
# GPU_TYPE: auto, cuda, metal, cpu
GPU_TYPE=auto

# Worker types (comma-separated): inference, image, video
WORKER_TYPES=inference

#===============================================================================
# SECURITY NOTE:
#===============================================================================
# The API_KEY is REQUIRED for workers to communicate with the coordinator.
# Without a valid API_KEY, all requests will fail with 401 Unauthorized.
#
# To get the API_KEY:
# 1. SSH to Proxmox: ssh root@10.10.10.5
# 2. Enter LXC: pct enter 120
# 3. View key: grep API_KEY /opt/ai-cluster/.env
#===============================================================================
EOF

    print_success "configs/worker-config.template created"
}

run_coordinator_setup() {
    echo ""
    print_info "Running coordinator setup..."

    if [ -f "$SCRIPT_DIR/scripts/setup-coordinator.sh" ]; then
        chmod +x "$SCRIPT_DIR/scripts/setup-coordinator.sh"
        "$SCRIPT_DIR/scripts/setup-coordinator.sh"
    else
        print_warning "setup-coordinator.sh not found, skipping"
        print_info "Run 'docker compose up -d' manually to start services"
    fi
}

print_completion() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN} Setup Complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Access Points:"
    echo "  Frontend: http://$COORDINATOR_IP"
    echo "  API:      http://$COORDINATOR_IP/api/$API_VERSION"
    echo "  Health:   http://$COORDINATOR_IP/api/$API_VERSION/system/health"
    echo ""
    echo -e "${RED}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED} SAVE YOUR API KEY (Required for workers and frontend):${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${GREEN}  API_KEY=$API_KEY${NC}"
    echo ""
    echo "This key is saved in .env file. Workers need this key to connect."
    echo "You can also enter it in the frontend Settings page."
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW} IMPORTANT NOTES:${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "1. This LXC IP ($COORDINATOR_IP) is assigned by DHCP"
    echo "2. IP may change if LXC restarts or DHCP lease expires"
    echo "3. Consider DHCP reservation for this LXC MAC address"
    echo "4. Workers must always use LXC IP, never Proxmox host IP"
    echo ""
    echo "To check LXC IP anytime (from Proxmox host):"
    echo "  pct exec 120 -- hostname -I"
    echo ""
    echo "To view your API_KEY later:"
    echo "  grep API_KEY /opt/ai-cluster/.env"
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE} Next Steps:${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "1. Setup workers (use the API_KEY shown above):"
    echo ""
    echo "   GPU Worker (Windows with NVIDIA GPU):"
    echo "     - Copy configs/worker-config.template to the GPU machine"
    echo "     - Rename to worker-config.env"
    echo "     - Set API_KEY=$API_KEY"
    echo "     - Run: .\\setup-worker-windows.ps1 --gpu"
    echo ""
    echo "   CPU Worker (Windows without GPU):"
    echo "     - Copy configs/worker-config.template to the CPU machine"
    echo "     - Rename to worker-config.env"
    echo "     - Set API_KEY=$API_KEY"
    echo "     - Run: .\\setup-worker-windows.ps1 --cpu-only"
    echo ""
    echo "   Mac Worker (macOS with Apple Silicon):"
    echo "     - Copy configs/worker-config.template to the Mac"
    echo "     - Rename to worker-config.env"
    echo "     - Set API_KEY=$API_KEY"
    echo "     - Run: ./setup-worker-macos.sh"
    echo ""
    echo "2. Setup monitor (optional):"
    echo "   Run on Proxmox Node 3: ./scripts/setup-monitor-lxc.sh"
    echo ""
    echo "3. Open UI: http://$COORDINATOR_IP"
    echo "   Enter the API_KEY in Settings page for full access"
    echo ""
}

#-------------------------------------------------------------------------------
# Main
#-------------------------------------------------------------------------------

main() {
    print_header
    check_prerequisites
    configure_network
    configure_options
    generate_env_file
    generate_worker_config_template
    run_coordinator_setup
    print_completion
}

main "$@"
