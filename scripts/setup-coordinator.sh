#!/bin/bash
# Dual License - AGPL-3.0 or Commercial - Copyright (c) 2025 MarkShenT
# See LICENSE file for details
#===============================================================================
# AI Cluster - Coordinator Setup Script
#===============================================================================
# This script sets up and starts the Docker Compose stack for the coordinator.
# Run this script INSIDE the LXC container (10.10.10.75).
#
# Usage: ./scripts/setup-coordinator.sh
#===============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Health check settings
MAX_RETRIES=30
RETRY_DELAY=2

#-------------------------------------------------------------------------------
# Helper Functions
#-------------------------------------------------------------------------------

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${BLUE}→ $1${NC}"; }

#-------------------------------------------------------------------------------
# Setup Functions
#-------------------------------------------------------------------------------

check_env_file() {
    if [ ! -f "$PROJECT_DIR/.env" ]; then
        print_error ".env file not found"
        echo "Please run ./setup.sh first to generate configuration"
        exit 1
    fi
    print_success ".env file exists"

    # Load environment variables
    set -a
    source "$PROJECT_DIR/.env"
    set +a
}

create_docker_volumes() {
    print_info "Creating Docker volumes..."

    # Create named volumes (Docker manages storage)
    docker volume create ai-cluster-models 2>/dev/null || true
    docker volume create ai-cluster-results 2>/dev/null || true
    docker volume create ai-cluster-projects 2>/dev/null || true
    docker volume create ai-cluster-db 2>/dev/null || true

    print_success "Docker volumes created"
}

build_services() {
    print_info "Building Docker services..."

    cd "$PROJECT_DIR"

    # Build all services
    docker compose build --no-cache

    print_success "Services built"
}

start_services() {
    print_info "Starting Docker services..."

    cd "$PROJECT_DIR"

    # Start services in detached mode
    docker compose up -d

    print_success "Services starting..."
}

wait_for_health() {
    print_info "Waiting for services to be healthy..."

    local coordinator_url="http://localhost:5000/api/v1/system/health"
    local retries=0

    while [ $retries -lt $MAX_RETRIES ]; do
        if curl -sf "$coordinator_url" > /dev/null 2>&1; then
            print_success "Coordinator is healthy"
            return 0
        fi

        retries=$((retries + 1))
        echo "  Waiting for coordinator... ($retries/$MAX_RETRIES)"
        sleep $RETRY_DELAY
    done

    print_error "Coordinator failed to become healthy"
    echo ""
    echo "Check logs with: docker compose logs coordinator"
    return 1
}

check_redis() {
    print_info "Checking Redis connection..."

    if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
        print_success "Redis is responding"
    else
        print_warning "Redis may not be ready yet"
    fi
}

initialize_database() {
    print_info "Initializing database..."

    # The coordinator should auto-initialize the database on startup
    # This just verifies it worked
    local db_check=$(docker compose exec -T coordinator python -c "
from app import db
from models import Job, Worker, Model, Setting
print(len(db.engine.table_names()))
" 2>/dev/null || echo "0")

    if [ "$db_check" -gt "0" ]; then
        print_success "Database initialized with $db_check tables"
    else
        print_warning "Database may need manual initialization"
    fi
}

download_initial_model() {
    if [ "${INITIAL_MODEL_DOWNLOAD:-false}" = "true" ]; then
        print_info "Downloading initial model (34B DeepSeek Coder)..."
        print_warning "This will take a while (~18GB download)"
        echo ""
        echo "You can monitor progress at: http://${COORDINATOR_IP}/models"
        echo "Or check logs: docker compose logs -f coordinator"
        echo ""

        # Trigger model download via API
        curl -s -X POST "http://localhost:5000/api/v1/models/download" \
            -H "Content-Type: application/json" \
            -d '{
                "provider": "deepseek",
                "model_id": "34b",
                "model_name": "DeepSeek Coder 34B Q4",
                "url": "https://huggingface.co/TheBloke/deepseek-coder-34B-instruct-GGUF/resolve/main/deepseek-coder-34b-instruct.Q4_K_M.gguf",
                "size_gb": 18.3
            }' > /dev/null 2>&1 || print_warning "Model download request may have failed - check UI"

        print_info "Model download initiated (runs in background)"
    else
        print_info "Skipping initial model download"
        echo "Download models later via the web UI or API"
    fi
}

print_service_status() {
    echo ""
    print_info "Service Status:"
    echo ""
    docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    echo ""
}

run_component_tests() {
    print_info "Running component tests..."

    local all_passed=true

    # Test 1: Redis
    if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
        print_success "Redis: OK"
    else
        print_error "Redis: FAILED"
        all_passed=false
    fi

    # Test 2: Coordinator API
    if curl -sf "http://localhost:5000/api/v1/system/health" > /dev/null 2>&1; then
        print_success "Coordinator API: OK"
    else
        print_error "Coordinator API: FAILED"
        all_passed=false
    fi

    # Test 3: Frontend (Nginx)
    if curl -sf "http://localhost:80" > /dev/null 2>&1; then
        print_success "Frontend (Nginx): OK"
    else
        print_warning "Frontend (Nginx): May still be starting"
    fi

    # Test 4: Model directory
    if docker compose exec -T coordinator ls /models > /dev/null 2>&1; then
        print_success "Models volume: OK"
    else
        print_error "Models volume: FAILED"
        all_passed=false
    fi

    echo ""

    if [ "$all_passed" = true ]; then
        print_success "All component tests passed"
    else
        print_warning "Some tests failed - check logs for details"
    fi
}

#-------------------------------------------------------------------------------
# Main
#-------------------------------------------------------------------------------

main() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE} AI Cluster Coordinator Setup${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""

    cd "$PROJECT_DIR"

    check_env_file
    create_docker_volumes
    build_services
    start_services
    wait_for_health
    check_redis
    initialize_database
    download_initial_model
    print_service_status
    run_component_tests

    echo ""
    print_success "Coordinator setup complete!"
    echo ""
    echo "Access the UI at: http://${COORDINATOR_IP:-localhost}"
    echo ""
}

main "$@"
