#!/bin/bash
# Dual License - AGPL-3.0 or Commercial - Copyright (c) 2025 MarkShenT
# See LICENSE file for details
#===============================================================================
# AI Cluster - Deploy to LXC Script
#===============================================================================
# Run this script ON THE PROXMOX HOST (10.10.10.5) to deploy the AI Cluster
# to the coordinator LXC container (CTID: 120, IP: 10.10.10.75).
#
# Prerequisites:
#   - Copy ai-cluster folder to Proxmox host first:
#     scp -r ai-cluster root@10.10.10.5:/tmp/
#
# Usage:
#   ssh root@10.10.10.5
#   cd /tmp/ai-cluster
#   ./scripts/deploy-to-lxc.sh
#
# Options:
#   --ctid NUM    Container ID (default: 120)
#   --dest PATH   Destination path in LXC (default: /opt/ai-cluster)
#   --run-setup   Automatically run setup.sh after deployment
#===============================================================================

set -e

# Configuration
CTID=${CTID:-120}
DEST_PATH="/opt/ai-cluster"
RUN_SETUP=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${BLUE}→ $1${NC}"; }

#-------------------------------------------------------------------------------
# Parse Arguments
#-------------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
    case $1 in
        --ctid)
            CTID="$2"
            shift 2
            ;;
        --dest)
            DEST_PATH="$2"
            shift 2
            ;;
        --run-setup)
            RUN_SETUP=true
            shift
            ;;
        --help|-h)
            echo "Usage: ./deploy-to-lxc.sh [--ctid NUM] [--dest PATH] [--run-setup]"
            echo ""
            echo "Options:"
            echo "  --ctid NUM      Container ID (default: 120)"
            echo "  --dest PATH     Destination in LXC (default: /opt/ai-cluster)"
            echo "  --run-setup     Run setup.sh automatically after deployment"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

#-------------------------------------------------------------------------------
# Validation
#-------------------------------------------------------------------------------

# Check if running on Proxmox
if [ ! -f /etc/pve/.version ]; then
    print_error "This script must be run on a Proxmox host"
    echo ""
    echo "Steps to deploy:"
    echo "  1. Copy this folder to Proxmox: scp -r ai-cluster root@10.10.10.5:/tmp/"
    echo "  2. SSH to Proxmox: ssh root@10.10.10.5"
    echo "  3. Run this script: cd /tmp/ai-cluster && ./scripts/deploy-to-lxc.sh"
    exit 1
fi

# Check if container exists
if ! pct status $CTID &> /dev/null; then
    print_error "Container $CTID does not exist"
    echo "Available containers:"
    pct list
    exit 1
fi

# Check if container is running
if ! pct status $CTID | grep -q "running"; then
    print_warning "Container $CTID is not running, starting..."
    pct start $CTID
    sleep 3
fi

# Get script directory (where this script is located)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE} AI Cluster - Deploy to LXC${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Source:      $PROJECT_DIR"
echo "Target LXC:  $CTID"
echo "Destination: $DEST_PATH"
echo ""

#-------------------------------------------------------------------------------
# Deploy
#-------------------------------------------------------------------------------

print_info "Creating tarball..."
cd "$(dirname "$PROJECT_DIR")"
tar czf /tmp/ai-cluster-deploy.tar.gz "$(basename "$PROJECT_DIR")"
print_success "Tarball created"

print_info "Copying to LXC $CTID..."
pct push $CTID /tmp/ai-cluster-deploy.tar.gz /tmp/ai-cluster-deploy.tar.gz
print_success "Files copied"

print_info "Extracting in LXC..."
pct exec $CTID -- mkdir -p "$(dirname "$DEST_PATH")"
pct exec $CTID -- rm -rf "$DEST_PATH"
pct exec $CTID -- tar xzf /tmp/ai-cluster-deploy.tar.gz -C "$(dirname "$DEST_PATH")"
# Rename if extracted folder name differs
pct exec $CTID -- mv "$(dirname "$DEST_PATH")/$(basename "$PROJECT_DIR")" "$DEST_PATH" 2>/dev/null || true
pct exec $CTID -- rm /tmp/ai-cluster-deploy.tar.gz
print_success "Extracted to $DEST_PATH"

print_info "Setting permissions..."
pct exec $CTID -- chmod +x "$DEST_PATH/setup.sh"
pct exec $CTID -- chmod +x "$DEST_PATH/scripts/"*.sh 2>/dev/null || true
print_success "Permissions set"

# Clean up local tarball
rm -f /tmp/ai-cluster-deploy.tar.gz

#-------------------------------------------------------------------------------
# Run Setup (if requested)
#-------------------------------------------------------------------------------

if [ "$RUN_SETUP" = true ]; then
    echo ""
    print_info "Running setup.sh in LXC..."
    echo ""
    pct exec $CTID -- bash -c "cd $DEST_PATH && ./setup.sh"
else
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN} Deployment Complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Next steps:"
    echo ""
    echo "  1. Enter the LXC container:"
    echo "     pct enter $CTID"
    echo ""
    echo "  2. Run the setup script:"
    echo "     cd $DEST_PATH"
    echo "     ./setup.sh"
    echo ""
    echo "  Or run setup automatically:"
    echo "     ./scripts/deploy-to-lxc.sh --run-setup"
    echo ""
fi

# Get LXC IP for reference
LXC_IP=$(pct exec $CTID -- hostname -I 2>/dev/null | awk '{print $1}')
if [ -n "$LXC_IP" ]; then
    echo "LXC IP Address: $LXC_IP"
    echo "After setup, access UI at: http://$LXC_IP"
    echo ""
fi
