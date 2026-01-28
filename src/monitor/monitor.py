#!/usr/bin/env python3
# Dual License - AGPL-3.0 or Commercial - Copyright (c) 2025 MarkShenT
# See LICENSE file for details
"""
AI Cluster Monitor Dashboard
============================
Lightweight monitoring dashboard for Pi 5 LXC.
Polls coordinator every 60 seconds and displays system status.
"""

import os
import time
import logging
import threading
from datetime import datetime, timedelta

import requests
from flask import Flask, render_template, jsonify

# Configuration
COORDINATOR_URL = os.environ.get('COORDINATOR_URL', 'http://10.10.10.75')
API_KEY = os.environ.get('API_KEY', '')
POLL_INTERVAL = int(os.environ.get('POLL_INTERVAL', '60'))  # seconds
PORT = int(os.environ.get('MONITOR_PORT', '8080'))

# Logging
logging.basicConfig(
    level=os.environ.get('LOG_LEVEL', 'INFO'),
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Flask app
app = Flask(__name__)

# Cached status data
status_cache = {
    'last_updated': None,
    'coordinator': {'status': 'unknown'},
    'workers': [],
    'jobs': {
        'total': 0,
        'queued': 0,
        'running': 0,
        'completed': 0,
        'failed': 0
    },
    'recent_jobs': [],
    'models': [],
    'error': None
}

#===============================================================================
# API Helpers
#===============================================================================

def get_headers():
    """Get headers for API requests."""
    headers = {'Content-Type': 'application/json'}
    if API_KEY:
        headers['X-API-Key'] = API_KEY
    return headers

def fetch_coordinator_data():
    """Fetch data from coordinator API."""
    global status_cache

    try:
        # Health check
        health_resp = requests.get(
            f"{COORDINATOR_URL}/api/v1/system/health",
            headers=get_headers(),
            timeout=10
        )

        if health_resp.status_code == 200:
            health_data = health_resp.json()
            status_cache['coordinator'] = {
                'status': health_data.get('status', 'unknown'),
                'version': health_data.get('version', 'unknown'),
                'services': health_data.get('services', {})
            }
        else:
            status_cache['coordinator'] = {'status': 'error', 'code': health_resp.status_code}

        # Workers
        workers_resp = requests.get(
            f"{COORDINATOR_URL}/api/v1/workers",
            headers=get_headers(),
            timeout=10
        )

        if workers_resp.status_code == 200:
            workers_data = workers_resp.json()
            status_cache['workers'] = workers_data.get('workers', [])

            # Check for stale workers (no heartbeat in 2 minutes)
            now = datetime.utcnow()
            for worker in status_cache['workers']:
                last_hb = worker.get('last_heartbeat', '')
                if last_hb:
                    try:
                        hb_time = datetime.fromisoformat(last_hb.replace('Z', '+00:00').replace('+00:00', ''))
                        if (now - hb_time) > timedelta(minutes=2):
                            worker['status'] = 'offline'
                    except:
                        pass

        # Jobs stats
        stats_resp = requests.get(
            f"{COORDINATOR_URL}/api/v1/system/stats",
            headers=get_headers(),
            timeout=10
        )

        if stats_resp.status_code == 200:
            stats_data = stats_resp.json()
            status_cache['jobs'] = {
                'total': stats_data.get('total_jobs', 0),
                'queued': stats_data.get('jobs_queued', 0),
                'running': stats_data.get('jobs_running', 0),
                'completed': stats_data.get('jobs_completed', 0),
                'failed': stats_data.get('total_jobs', 0) - stats_data.get('jobs_completed', 0) - stats_data.get('jobs_queued', 0) - stats_data.get('jobs_running', 0)
            }
            if status_cache['jobs']['failed'] < 0:
                status_cache['jobs']['failed'] = 0

        # Recent jobs (last 10)
        jobs_resp = requests.get(
            f"{COORDINATOR_URL}/api/v1/jobs",
            headers=get_headers(),
            params={'limit': 10},
            timeout=10
        )

        if jobs_resp.status_code == 200:
            jobs_data = jobs_resp.json()
            status_cache['recent_jobs'] = jobs_data.get('jobs', [])

        # Models
        models_resp = requests.get(
            f"{COORDINATOR_URL}/api/v1/models",
            headers=get_headers(),
            timeout=10
        )

        if models_resp.status_code == 200:
            models_data = models_resp.json()
            status_cache['models'] = models_data.get('models', [])

        status_cache['last_updated'] = datetime.utcnow().isoformat() + 'Z'
        status_cache['error'] = None

        logger.info(f"Status updated: {len(status_cache['workers'])} workers, {status_cache['jobs']['total']} jobs")

    except requests.exceptions.ConnectionError:
        status_cache['error'] = 'Cannot connect to coordinator'
        status_cache['coordinator'] = {'status': 'offline'}
        logger.error(f"Cannot connect to coordinator at {COORDINATOR_URL}")
    except requests.exceptions.Timeout:
        status_cache['error'] = 'Coordinator request timed out'
        logger.error("Coordinator request timed out")
    except Exception as e:
        status_cache['error'] = str(e)
        logger.error(f"Error fetching coordinator data: {e}")

def polling_loop():
    """Background thread to poll coordinator."""
    while True:
        fetch_coordinator_data()
        time.sleep(POLL_INTERVAL)

#===============================================================================
# Routes
#===============================================================================

@app.route('/')
def dashboard():
    """Main dashboard page."""
    return render_template('dashboard.html',
                          status=status_cache,
                          coordinator_url=COORDINATOR_URL,
                          poll_interval=POLL_INTERVAL)

@app.route('/api/status')
def api_status():
    """JSON status endpoint for API consumers."""
    return jsonify(status_cache)

@app.route('/api/refresh')
def api_refresh():
    """Force refresh status data."""
    fetch_coordinator_data()
    return jsonify({'success': True, 'message': 'Status refreshed'})

@app.route('/health')
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'coordinator_connected': status_cache['coordinator'].get('status') == 'healthy',
        'last_updated': status_cache['last_updated']
    })

#===============================================================================
# Main
#===============================================================================

if __name__ == '__main__':
    logger.info(f"Starting AI Cluster Monitor Dashboard")
    logger.info(f"Coordinator URL: {COORDINATOR_URL}")
    logger.info(f"Poll interval: {POLL_INTERVAL}s")
    logger.info(f"API Key configured: {'Yes' if API_KEY else 'No'}")

    # Initial fetch
    fetch_coordinator_data()

    # Start polling thread
    polling_thread = threading.Thread(target=polling_loop, daemon=True)
    polling_thread.start()

    # Run Flask
    app.run(host='0.0.0.0', port=PORT, debug=False)
