#!/bin/bash
# Dual License - AGPL-3.0 or Commercial - Copyright (c) 2025 MarkShenT
# See LICENSE file for details
#===============================================================================
# AI Cluster - Monitor LXC Setup Script
#===============================================================================
# This script creates and configures an LXC container for the monitor dashboard.
# Run this script on Proxmox Node 3 (Raspberry Pi 5) host.
#
# Usage: ./setup-monitor-lxc.sh [options]
#
# Options:
#   --ctid NUM       Container ID (default: 122)
#   --coordinator IP Coordinator IP address (default: 10.10.10.75)
#   --skip-lxc       Skip LXC creation (use existing container)
#===============================================================================

set -e

# Configuration
DEFAULT_CTID=122
DEFAULT_COORDINATOR_IP="10.10.10.75"
DEFAULT_HOSTNAME="ai-monitor"
DEFAULT_MEMORY=1024       # MB
DEFAULT_SWAP=512          # MB
DEFAULT_CORES=2
DEFAULT_DISK_SIZE=5       # GB
DEFAULT_MONITOR_PORT=8080
STORAGE="vm"

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

AI Cluster Monitor LXC Setup
=============================

This script creates an LXC container on Proxmox (Pi 5) for the monitor dashboard.

Usage:
    ./setup-monitor-lxc.sh [options]

Options:
    --ctid NUM          Container ID (default: 200)
    --coordinator IP    Coordinator IP (default: 10.10.10.75)
    --skip-lxc          Use existing container (skip creation)
    --help              Show this help

Requirements:
    - Run on Proxmox host (Node 3 / Pi 5)
    - Ubuntu template available in local storage
    - Network bridge configured (vmbr0)

The monitor will:
    - Poll coordinator every 60 seconds
    - Display worker status
    - Show queue depth and recent jobs
    - Serve dashboard at http://<lxc-ip>:8080

EOF
}

#-------------------------------------------------------------------------------
# Parse Arguments
#-------------------------------------------------------------------------------

CTID=$DEFAULT_CTID
COORDINATOR_IP=$DEFAULT_COORDINATOR_IP
SKIP_LXC=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --ctid)
            CTID="$2"
            shift 2
            ;;
        --coordinator)
            COORDINATOR_IP="$2"
            shift 2
            ;;
        --skip-lxc)
            SKIP_LXC=true
            shift
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

#-------------------------------------------------------------------------------
# Validation
#-------------------------------------------------------------------------------

check_prerequisites() {
    print_info "Checking prerequisites..."

    # Check if running on Proxmox
    if [ ! -f /etc/pve/.version ]; then
        print_error "This script must run on a Proxmox host"
        exit 1
    fi
    print_success "Running on Proxmox"

    # Check pct command
    if ! command -v pct &> /dev/null; then
        print_error "pct command not found"
        exit 1
    fi
    print_success "pct command available"

    # Check if container already exists
    if pct status $CTID &> /dev/null; then
        if [ "$SKIP_LXC" = true ]; then
            print_warning "Container $CTID exists (will use existing)"
        else
            print_error "Container $CTID already exists"
            echo "Use --skip-lxc to use existing container, or choose different --ctid"
            exit 1
        fi
    else
        if [ "$SKIP_LXC" = true ]; then
            print_error "Container $CTID does not exist"
            echo "Remove --skip-lxc to create new container"
            exit 1
        fi
        print_success "Container ID $CTID is available"
    fi
}

find_template() {
    print_info "Finding Ubuntu template..."

    # Detect architecture
    ARCH=$(dpkg --print-architecture)
    print_info "Detected architecture: $ARCH"

    # Look for any existing Ubuntu template first (prefer 22.04/jammy)
    TEMPLATE=$(pveam list local 2>/dev/null | grep -i "ubuntu" | grep -E "(22\.04|jammy)" | head -1 | awk '{print $1}')

    if [ -z "$TEMPLATE" ]; then
        # Try any Ubuntu template
        TEMPLATE=$(pveam list local 2>/dev/null | grep -i "ubuntu" | head -1 | awk '{print $1}')
    fi

    if [ -z "$TEMPLATE" ]; then
        print_warning "No Ubuntu template found, downloading..."
        pveam update

        # Determine correct template name based on architecture
        case $ARCH in
            amd64)
                TEMPLATE_FILE="ubuntu-22.04-standard_22.04-1_amd64.tar.zst"
                ;;
            arm64|aarch64)
                # ARM64 uses different naming: ubuntu-jammy-20231124_arm64.tar.xz
                TEMPLATE_FILE="ubuntu-jammy-20231124_arm64.tar.xz"
                ;;
            *)
                print_error "Unsupported architecture: $ARCH"
                echo "Available templates:"
                pveam available | grep ubuntu
                exit 1
                ;;
        esac

        print_info "Downloading: $TEMPLATE_FILE"
        pveam download local "$TEMPLATE_FILE" || {
            print_error "Failed to download template: $TEMPLATE_FILE"
            echo ""
            echo "Available Ubuntu templates for your architecture:"
            pveam available | grep -i ubuntu | grep -i "$ARCH" || pveam available | grep ubuntu
            exit 1
        }

        TEMPLATE=$(pveam list local | grep -i "ubuntu" | head -1 | awk '{print $1}')
    fi

    if [ -z "$TEMPLATE" ]; then
        print_error "Could not find or download Ubuntu template"
        echo "Available templates in local storage:"
        pveam list local || echo "  (none)"
        echo ""
        echo "Available for download:"
        pveam available | grep ubuntu
        exit 1
    fi

    print_success "Template: $TEMPLATE"
}

#-------------------------------------------------------------------------------
# LXC Creation
#-------------------------------------------------------------------------------

create_lxc() {
    if [ "$SKIP_LXC" = true ]; then
        print_info "Skipping LXC creation (using existing)"
        return 0
    fi

    print_info "Creating LXC container..."

    pct create $CTID "$TEMPLATE" \
        --hostname "$DEFAULT_HOSTNAME" \
        --memory $DEFAULT_MEMORY \
        --swap $DEFAULT_SWAP \
        --cores $DEFAULT_CORES \
        --net0 name=eth0,bridge=vmbr0,ip=dhcp,firewall=0 \
        --storage $STORAGE \
        --rootfs ${STORAGE}:${DEFAULT_DISK_SIZE} \
        --unprivileged 1 \
        --features nesting=1

    print_success "LXC container $CTID created"
}

start_lxc() {
    print_info "Starting LXC container..."

    if ! pct status $CTID | grep -q "running"; then
        pct start $CTID
        sleep 5
    fi

    print_success "Container $CTID is running"
}

get_lxc_ip() {
    print_info "Getting LXC IP address..."

    local retries=0
    local max_retries=30

    while [ $retries -lt $max_retries ]; do
        LXC_IP=$(pct exec $CTID -- hostname -I 2>/dev/null | awk '{print $1}')

        if [ -n "$LXC_IP" ]; then
            print_success "LXC IP: $LXC_IP"
            return 0
        fi

        retries=$((retries + 1))
        echo "  Waiting for IP... ($retries/$max_retries)"
        sleep 2
    done

    print_error "Could not get LXC IP address"
    exit 1
}

#-------------------------------------------------------------------------------
# Software Installation
#-------------------------------------------------------------------------------

install_packages() {
    print_info "Installing packages in LXC..."

    pct exec $CTID -- bash -c "
        apt-get update
        apt-get install -y python3 python3-pip python3-venv git curl
    "

    print_success "Packages installed"
}

install_monitor() {
    print_info "Installing monitor application..."

    # Create monitor directory
    pct exec $CTID -- mkdir -p /opt/ai-monitor/templates

    # Create monitor.py
    pct exec $CTID -- bash -c "cat > /opt/ai-monitor/monitor.py << 'MONITOR_EOF'
#!/usr/bin/env python3
\"\"\"
AI Cluster Monitor Dashboard
Polls coordinator and displays system status
\"\"\"

import os
import json
import time
import logging
from datetime import datetime
from flask import Flask, render_template_string
import requests

# Configuration
COORDINATOR_URL = os.environ.get('COORDINATOR_URL', 'http://$COORDINATOR_IP')
POLL_INTERVAL = int(os.environ.get('POLL_INTERVAL', '60'))
PORT = int(os.environ.get('MONITOR_PORT', '$DEFAULT_MONITOR_PORT'))

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# State
last_poll = None
system_status = {
    'workers': [],
    'queue': {'total': 0, 'by_priority': {}},
    'recent_jobs': [],
    'health': {},
    'error': None
}

DASHBOARD_TEMPLATE = '''
<!DOCTYPE html>
<html>
<head>
    <title>AI System Monitor</title>
    <meta http-equiv=\"refresh\" content=\"60\">
    <style>
        body { font-family: monospace; background: #1a1a1a; color: #f0f0f0; padding: 20px; }
        h1 { color: #4a9eff; }
        .section { margin: 20px 0; padding: 15px; background: #2a2a2a; border-radius: 8px; }
        .section h2 { margin-top: 0; color: #6fb3ff; }
        .online { color: #4ade80; }
        .offline { color: #f87171; }
        .busy { color: #fbbf24; }
        .success { color: #4ade80; }
        .failed { color: #f87171; }
        table { border-collapse: collapse; width: 100%; }
        th, td { text-align: left; padding: 8px; border-bottom: 1px solid #444; }
        .error { background: #7f1d1d; padding: 10px; border-radius: 4px; }
        .footer { color: #666; margin-top: 20px; font-size: 0.9em; }
    </style>
</head>
<body>
    <h1>AI System Monitor</h1>
    <p>Last updated: {{ last_poll }}</p>

    {% if error %}
    <div class=\"error\">Error: {{ error }}</div>
    {% endif %}

    <div class=\"section\">
        <h2>Workers</h2>
        <table>
            <tr><th>ID</th><th>Status</th><th>GPU</th><th>Current Job</th><th>Last Seen</th></tr>
            {% for worker in workers %}
            <tr>
                <td>{{ worker.id }}</td>
                <td class=\"{{ worker.status }}\">{{ worker.status | upper }}</td>
                <td>{{ worker.gpu_type }}</td>
                <td>{{ worker.current_job or \"-\" }}</td>
                <td>{{ worker.last_heartbeat }}</td>
            </tr>
            {% endfor %}
            {% if not workers %}
            <tr><td colspan=\"5\">No workers registered</td></tr>
            {% endif %}
        </table>
    </div>

    <div class=\"section\">
        <h2>Queue Status</h2>
        <p>Total jobs in queue: <strong>{{ queue.total }}</strong></p>
        <ul>
            {% for priority, count in queue.by_priority.items() %}
            <li>Priority {{ priority }}: {{ count }} jobs</li>
            {% endfor %}
        </ul>
    </div>

    <div class=\"section\">
        <h2>Recent Jobs (Last 10)</h2>
        <table>
            <tr><th>Time</th><th>Worker</th><th>Model</th><th>Status</th><th>Duration</th></tr>
            {% for job in recent_jobs %}
            <tr>
                <td>{{ job.completed_at or job.created_at }}</td>
                <td>{{ job.worker_id or \"-\" }}</td>
                <td>{{ job.model }}</td>
                <td class=\"{{ job.status }}\">{{ job.status }}</td>
                <td>{{ job.duration or \"-\" }}s</td>
            </tr>
            {% endfor %}
            {% if not recent_jobs %}
            <tr><td colspan=\"5\">No recent jobs</td></tr>
            {% endif %}
        </table>
    </div>

    <div class=\"section\">
        <h2>System Health</h2>
        <ul>
            <li>Coordinator: <span class=\"{{ \"online\" if health.coordinator else \"offline\" }}\">{{ \"Online\" if health.coordinator else \"Offline\" }}</span></li>
            <li>Redis: <span class=\"{{ \"online\" if health.redis else \"offline\" }}\">{{ \"Connected\" if health.redis else \"Disconnected\" }}</span></li>
            <li>Database: <span class=\"{{ \"online\" if health.database else \"offline\" }}\">{{ \"Connected\" if health.database else \"Disconnected\" }}</span></li>
        </ul>
    </div>

    <div class=\"footer\">
        Polling interval: {{ poll_interval }}s | Coordinator: {{ coordinator_url }}
    </div>
</body>
</html>
'''

def poll_coordinator():
    global last_poll, system_status

    try:
        # Get workers
        workers_resp = requests.get(f'{COORDINATOR_URL}/api/v1/workers', timeout=10)
        if workers_resp.ok:
            system_status['workers'] = workers_resp.json().get('workers', [])

        # Get health
        health_resp = requests.get(f'{COORDINATOR_URL}/api/v1/system/health', timeout=10)
        if health_resp.ok:
            health = health_resp.json()
            system_status['health'] = {
                'coordinator': True,
                'redis': health.get('services', {}).get('redis') == 'connected',
                'database': health.get('services', {}).get('database') == 'connected'
            }

        # Get recent jobs
        jobs_resp = requests.get(f'{COORDINATOR_URL}/api/v1/jobs?limit=10', timeout=10)
        if jobs_resp.ok:
            system_status['recent_jobs'] = jobs_resp.json().get('jobs', [])

        # Get queue status (from stats)
        stats_resp = requests.get(f'{COORDINATOR_URL}/api/v1/system/stats', timeout=10)
        if stats_resp.ok:
            stats = stats_resp.json()
            # Estimate queue from stats
            system_status['queue'] = {
                'total': stats.get('jobs_queued', 0),
                'by_priority': stats.get('queue_by_priority', {})
            }

        system_status['error'] = None
        last_poll = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        logger.info(f'Poll successful: {len(system_status[\"workers\"])} workers')

    except requests.RequestException as e:
        system_status['error'] = str(e)
        system_status['health'] = {'coordinator': False, 'redis': False, 'database': False}
        logger.error(f'Poll failed: {e}')

@app.route('/')
def dashboard():
    return render_template_string(
        DASHBOARD_TEMPLATE,
        last_poll=last_poll,
        workers=system_status['workers'],
        queue=system_status['queue'],
        recent_jobs=system_status['recent_jobs'],
        health=system_status['health'],
        error=system_status['error'],
        poll_interval=POLL_INTERVAL,
        coordinator_url=COORDINATOR_URL
    )

@app.route('/health')
def health():
    return {'status': 'ok', 'last_poll': last_poll}

def poll_loop():
    import threading
    def loop():
        while True:
            poll_coordinator()
            time.sleep(POLL_INTERVAL)

    thread = threading.Thread(target=loop, daemon=True)
    thread.start()

if __name__ == '__main__':
    logger.info(f'Starting AI Cluster Monitor')
    logger.info(f'Coordinator: {COORDINATOR_URL}')
    logger.info(f'Poll interval: {POLL_INTERVAL}s')

    # Initial poll
    poll_coordinator()

    # Start polling thread
    poll_loop()

    # Start Flask
    app.run(host='0.0.0.0', port=PORT)
MONITOR_EOF
"

    print_success "Monitor application created"
}

install_requirements() {
    print_info "Installing Python requirements..."

    pct exec $CTID -- pip3 install flask requests

    print_success "Requirements installed"
}

create_systemd_service() {
    print_info "Creating systemd service..."

    pct exec $CTID -- bash -c "cat > /etc/systemd/system/ai-monitor.service << 'SERVICE_EOF'
[Unit]
Description=AI Cluster Monitor Dashboard
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-monitor
Environment=COORDINATOR_URL=http://$COORDINATOR_IP
Environment=MONITOR_PORT=$DEFAULT_MONITOR_PORT
Environment=POLL_INTERVAL=60
ExecStart=/usr/bin/python3 /opt/ai-monitor/monitor.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE_EOF
"

    # Enable and start service
    pct exec $CTID -- systemctl daemon-reload
    pct exec $CTID -- systemctl enable ai-monitor
    pct exec $CTID -- systemctl start ai-monitor

    print_success "Systemd service created and started"
}

#-------------------------------------------------------------------------------
# Completion
#-------------------------------------------------------------------------------

print_completion() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN} AI Cluster Monitor Setup Complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Monitor Dashboard:"
    echo "  URL:         http://$LXC_IP:$DEFAULT_MONITOR_PORT"
    echo "  Container:   $CTID ($DEFAULT_HOSTNAME)"
    echo "  Coordinator: http://$COORDINATOR_IP"
    echo ""
    echo "Service Management:"
    echo "  Status:  pct exec $CTID -- systemctl status ai-monitor"
    echo "  Logs:    pct exec $CTID -- journalctl -u ai-monitor -f"
    echo "  Restart: pct exec $CTID -- systemctl restart ai-monitor"
    echo ""
    echo "Container Management:"
    echo "  Enter:   pct enter $CTID"
    echo "  Stop:    pct stop $CTID"
    echo "  Start:   pct start $CTID"
    echo ""

    # Save configuration
    cat > /root/ai-monitor-config.txt << EOF
AI Cluster Monitor Configuration
================================
Container ID: $CTID
Container IP: $LXC_IP
Hostname: $DEFAULT_HOSTNAME
Coordinator: http://$COORDINATOR_IP
Dashboard: http://$LXC_IP:$DEFAULT_MONITOR_PORT
Created: $(date)
EOF

    print_success "Configuration saved to /root/ai-monitor-config.txt"
    echo ""
}

#-------------------------------------------------------------------------------
# Main
#-------------------------------------------------------------------------------

main() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE} AI Cluster Monitor LXC Setup${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Container ID: $CTID"
    echo "Coordinator:  $COORDINATOR_IP"
    echo ""

    check_prerequisites
    find_template
    create_lxc
    start_lxc
    get_lxc_ip
    install_packages
    install_monitor
    install_requirements
    create_systemd_service
    print_completion
}

main "$@"
