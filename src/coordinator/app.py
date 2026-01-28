#!/usr/bin/env python3
# Dual License - AGPL-3.0 or Commercial - Copyright (c) 2025 MarkShenT
# See LICENSE file for details
"""
AI Cluster Coordinator - Main Application
=========================================
Flask API server for managing distributed AI inference jobs.

Security Features:
- API key authentication (X-API-Key header)
- CORS restricted to 10.10.10.x subnet
- Redis password authentication
- Input validation on all endpoints
"""

import os
import re
import json
import uuid
import logging
import threading
import zipfile
import shutil
from datetime import datetime
from functools import wraps
from ipaddress import ip_address, ip_network

import requests
from flask import Flask, request, jsonify, send_file, Response
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from werkzeug.utils import secure_filename
import redis

# Configuration
API_VERSION = os.environ.get('API_VERSION', 'v1')
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379')
MODELS_PATH = os.environ.get('MODELS_PATH', '/models')
RESULTS_PATH = os.environ.get('RESULTS_PATH', '/results')
PROJECTS_PATH = os.environ.get('PROJECTS_PATH', '/projects')
DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:////data/jobs.db')

# Security Configuration
API_KEY = os.environ.get('API_KEY', '')
# AUTH_DISABLED must be explicitly set to 'true' to allow running without API key
AUTH_DISABLED = os.environ.get('AUTH_DISABLED', 'false').lower() == 'true'
ALLOWED_SUBNET = os.environ.get('ALLOWED_SUBNET', '10.10.10.0/24')
CORS_ORIGINS = os.environ.get('CORS_ORIGINS', 'http://10.10.10.*')

# Logging
logging.basicConfig(
    level=os.environ.get('LOG_LEVEL', 'INFO'),
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask
app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key')

# CORS - Restrict to local subnet only
cors_origins_list = [
    'http://10.10.10.*',
    'http://localhost',
    'http://localhost:*',
    'http://127.0.0.1',
    'http://127.0.0.1:*'
]
CORS(app, origins=cors_origins_list, supports_credentials=True)

# SocketIO - Restrict to local subnet
socketio = SocketIO(
    app,
    cors_allowed_origins=cors_origins_list,
    async_mode='eventlet'
)

#===============================================================================
# Security Helpers
#===============================================================================

def get_client_ip():
    """Get the real client IP, considering X-Forwarded-For header."""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    if request.headers.get('X-Real-IP'):
        return request.headers.get('X-Real-IP')
    return request.remote_addr

def is_ip_allowed(client_ip):
    """Check if client IP is in allowed subnet."""
    try:
        # Allow localhost for internal Docker communication
        if client_ip in ('127.0.0.1', '::1', 'localhost'):
            return True
        # Allow Docker internal IPs
        if client_ip and client_ip.startswith('172.'):
            return True
        # Check against allowed subnet
        network = ip_network(ALLOWED_SUBNET, strict=False)
        return ip_address(client_ip) in network
    except (ValueError, TypeError):
        logger.warning(f"Could not parse IP: {client_ip}")
        return False

def require_api_key(f):
    """Decorator to require API key authentication."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Fail-safe: Require explicit AUTH_DISABLED=true to skip authentication
        if not API_KEY:
            if AUTH_DISABLED:
                # Only skip auth if explicitly disabled (for testing/development only)
                return f(*args, **kwargs)
            else:
                # API_KEY not set and AUTH_DISABLED not true = configuration error
                logger.error("API_KEY not configured. Set API_KEY env var or set AUTH_DISABLED=true for testing.")
                return jsonify({
                    'error': {
                        'code': 'SERVER_MISCONFIGURED',
                        'message': 'API key not configured on server. Contact administrator.'
                    }
                }), 500

        # Check API key in header
        provided_key = request.headers.get('X-API-Key')
        if not provided_key:
            logger.warning(f"Missing API key from {get_client_ip()}")
            return jsonify({'error': {'code': 'UNAUTHORIZED', 'message': 'API key required'}}), 401

        if provided_key != API_KEY:
            logger.warning(f"Invalid API key from {get_client_ip()}")
            return jsonify({'error': {'code': 'UNAUTHORIZED', 'message': 'Invalid API key'}}), 401

        return f(*args, **kwargs)
    return decorated_function

def require_subnet(f):
    """Decorator to restrict access to allowed subnet."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        client_ip = get_client_ip()
        if not is_ip_allowed(client_ip):
            logger.warning(f"Access denied from IP: {client_ip}")
            return jsonify({'error': {'code': 'FORBIDDEN', 'message': 'Access denied from this IP'}}), 403
        return f(*args, **kwargs)
    return decorated_function

#===============================================================================
# Input Validation Helpers
#===============================================================================

def validate_string(value, name, min_len=1, max_len=10000, required=True):
    """Validate a string input."""
    if value is None:
        if required:
            return None, f"{name} is required"
        return "", None

    if not isinstance(value, str):
        return None, f"{name} must be a string"

    value = value.strip()

    if len(value) < min_len:
        return None, f"{name} must be at least {min_len} characters"

    if len(value) > max_len:
        return None, f"{name} must be at most {max_len} characters"

    return value, None

def validate_int(value, name, min_val=None, max_val=None, default=None):
    """Validate an integer input."""
    if value is None:
        return default, None

    try:
        value = int(value)
    except (ValueError, TypeError):
        return None, f"{name} must be an integer"

    if min_val is not None and value < min_val:
        return None, f"{name} must be at least {min_val}"

    if max_val is not None and value > max_val:
        return None, f"{name} must be at most {max_val}"

    return value, None

def validate_model_id(model_id):
    """Validate model ID format."""
    if not model_id:
        return None, "model_id is required"

    # Allow alphanumeric, dots, dashes, underscores
    if not re.match(r'^[a-zA-Z0-9._-]+$', model_id):
        return None, "model_id contains invalid characters"

    if len(model_id) > 100:
        return None, "model_id too long"

    return model_id, None

def validate_worker_id(worker_id):
    """Validate worker ID format."""
    if not worker_id:
        return None, "worker_id is required"

    # Allow alphanumeric, dots, dashes, underscores
    if not re.match(r'^[a-zA-Z0-9._-]+$', worker_id):
        return None, "worker_id contains invalid characters"

    if len(worker_id) > 100:
        return None, "worker_id too long"

    return worker_id, None

def validate_url(url, name="url"):
    """Validate URL format."""
    if not url:
        return None, f"{name} is required"

    # Basic URL validation
    if not re.match(r'^https?://[^\s<>"{}|\\^`\[\]]+$', url):
        return None, f"{name} must be a valid HTTP(S) URL"

    if len(url) > 2000:
        return None, f"{name} too long"

    return url, None

# Redis connection (with password support)
REDIS_PASSWORD = os.environ.get('REDIS_PASSWORD', '')
try:
    if REDIS_PASSWORD:
        # Construct URL with password
        redis_url_parts = REDIS_URL.replace('redis://', '').split(':')
        redis_host = redis_url_parts[0]
        redis_port = redis_url_parts[1] if len(redis_url_parts) > 1 else '6379'
        redis_client = redis.Redis(
            host=redis_host,
            port=int(redis_port),
            password=REDIS_PASSWORD,
            decode_responses=True
        )
    else:
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    redis_client.ping()
    logger.info("Connected to Redis" + (" (authenticated)" if REDIS_PASSWORD else " (no auth)"))
except Exception as e:
    logger.warning(f"Redis connection failed: {e}")
    redis_client = None

# In-memory storage (replace with SQLite in production)
jobs_db = {}
workers_db = {}
models_db = {}
projects_db = {}

# Valid job types
VALID_JOB_TYPES = {'code', 'image', 'video'}

# Maximum project upload size (100MB)
MAX_PROJECT_SIZE = 100 * 1024 * 1024

# Active downloads tracking
active_downloads = {}

def download_model_background(model_id, url, filename):
    """Background thread for downloading model files."""
    try:
        model = models_db.get(model_id)
        if not model:
            logger.error(f"Model {model_id} not found in database")
            return

        logger.info(f"Starting download for {model_id} from {url}")

        # Create models directory if not exists
        os.makedirs(MODELS_PATH, exist_ok=True)
        output_path = os.path.join(MODELS_PATH, filename)

        # Download with progress tracking
        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()

        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        chunk_size = 8192

        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=chunk_size):
                if model_id not in models_db:
                    # Download was cancelled
                    logger.info(f"Download cancelled for {model_id}")
                    if os.path.exists(output_path):
                        os.remove(output_path)
                    return

                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)

                    # Update progress
                    if total_size > 0:
                        progress = downloaded / total_size
                        models_db[model_id]['download_progress'] = progress

                        # Emit progress via WebSocket
                        socketio.emit(f'model:{model_id}:progress', {
                            'model_id': model_id,
                            'progress': progress,
                            'downloaded': downloaded,
                            'total': total_size
                        })

        # Download complete
        models_db[model_id]['status'] = 'available'
        models_db[model_id]['download_progress'] = 1.0
        models_db[model_id]['size_gb'] = os.path.getsize(output_path) / (1024 * 1024 * 1024)

        logger.info(f"Download complete for {model_id}: {output_path}")

        # Emit completion event
        socketio.emit(f'model:{model_id}:completed', {
            'model_id': model_id,
            'status': 'available'
        })

    except requests.RequestException as e:
        logger.error(f"Download failed for {model_id}: {e}")
        if model_id in models_db:
            models_db[model_id]['status'] = 'failed'
            models_db[model_id]['error'] = str(e)

        socketio.emit(f'model:{model_id}:failed', {
            'model_id': model_id,
            'error': str(e)
        })

    except Exception as e:
        logger.error(f"Unexpected error downloading {model_id}: {e}")
        if model_id in models_db:
            models_db[model_id]['status'] = 'failed'
            models_db[model_id]['error'] = str(e)

    finally:
        # Clean up active downloads
        if model_id in active_downloads:
            del active_downloads[model_id]

#===============================================================================
# Database Models (simplified - expand with SQLAlchemy)
#===============================================================================

def generate_id():
    """Generate a unique ID."""
    return str(uuid.uuid4())[:8]

def now():
    """Get current timestamp."""
    return datetime.utcnow().isoformat() + 'Z'

#===============================================================================
# API Routes - System
#===============================================================================

@app.route(f'/api/{API_VERSION}/system/health', methods=['GET'])
@require_subnet
def health_check():
    """Health check endpoint (no API key required, but subnet restricted)."""
    redis_status = 'connected' if redis_client and redis_client.ping() else 'disconnected'

    # Determine authentication status
    if API_KEY:
        auth_status = 'enabled'
    elif AUTH_DISABLED:
        auth_status = 'disabled (AUTH_DISABLED=true)'
    else:
        auth_status = 'misconfigured (API_KEY required)'

    return jsonify({
        'status': 'healthy',
        'version': API_VERSION,
        'timestamp': now(),
        'services': {
            'redis': redis_status,
            'database': 'connected'
        },
        'security': {
            'api_key_required': bool(API_KEY) and not AUTH_DISABLED,
            'auth_status': auth_status,
            'allowed_subnet': ALLOWED_SUBNET
        }
    })

@app.route(f'/api/{API_VERSION}/system/stats', methods=['GET'])
@require_subnet
@require_api_key
def system_stats():
    """Get system statistics."""
    return jsonify({
        'total_jobs': len(jobs_db),
        'jobs_completed': len([j for j in jobs_db.values() if j['status'] == 'completed']),
        'jobs_queued': len([j for j in jobs_db.values() if j['status'] == 'queued']),
        'jobs_running': len([j for j in jobs_db.values() if j['status'] == 'running']),
        'workers_online': len([w for w in workers_db.values() if w['status'] == 'online']),
        'queue_by_priority': {}
    })

@app.route(f'/api/{API_VERSION}/system/settings', methods=['GET'])
@require_subnet
@require_api_key
def get_settings():
    """Get system settings."""
    return jsonify({
        'result_retention_days': int(os.environ.get('RESULT_RETENTION_DAYS', 30)),
        'default_model': os.environ.get('DEFAULT_MODEL', '34b'),
        'max_concurrent_jobs': int(os.environ.get('MAX_CONCURRENT_JOBS', 3))
    })

# In-memory storage for client config (persists until coordinator restart)
# In production, this should be stored in Redis or the database
client_config_store = {}

@app.route(f'/api/{API_VERSION}/system/client-config', methods=['GET'])
@require_subnet
def get_client_config():
    """
    Get client configuration (including saved API key).
    This endpoint does NOT require API key auth - it's how clients get the key.
    Protected by subnet restriction only.
    """
    # Try to get from Redis for persistence across restarts
    api_key = None
    if redis_client:
        try:
            api_key = redis_client.get('client_api_key')
        except Exception:
            pass

    # Fall back to in-memory store
    if not api_key:
        api_key = client_config_store.get('api_key')

    if api_key:
        return jsonify({
            'api_key': api_key,
            'source': 'server'
        })

    return jsonify({
        'api_key': None,
        'source': None
    })

@app.route(f'/api/{API_VERSION}/system/client-config', methods=['POST'])
@require_subnet
@require_api_key
def save_client_config():
    """
    Save client configuration (including API key for cross-browser access).
    Requires valid API key to save - proves the user knows the key.
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'Request body required'}}), 400

    api_key = data.get('api_key')
    if not api_key:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'api_key is required'}}), 400

    # Store in Redis for persistence
    if redis_client:
        try:
            redis_client.set('client_api_key', api_key)
            logger.info(f"Client API key saved to Redis from {get_client_ip()}")
        except Exception as e:
            logger.warning(f"Failed to save to Redis: {e}")

    # Also store in memory
    client_config_store['api_key'] = api_key

    return jsonify({
        'success': True,
        'message': 'API key saved for cross-browser access'
    })

#===============================================================================
# API Routes - Jobs
#===============================================================================

@app.route(f'/api/{API_VERSION}/jobs', methods=['POST'])
@require_subnet
@require_api_key
def submit_job():
    """Submit a new job."""
    data = request.get_json()

    if not data:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'Request body required'}}), 400

    # Validate prompt
    prompt, error = validate_string(data.get('prompt'), 'prompt', min_len=1, max_len=50000)
    if error:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': error}}), 400

    # Validate model
    model = data.get('model', os.environ.get('DEFAULT_MODEL', '34b'))
    model, error = validate_model_id(model)
    if error:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': error}}), 400

    # Validate priority
    priority, error = validate_int(data.get('priority'), 'priority', min_val=1, max_val=3, default=2)
    if error:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': error}}), 400

    # Validate job type
    job_type = data.get('type', 'code')
    if job_type not in VALID_JOB_TYPES:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': f'type must be one of: {", ".join(VALID_JOB_TYPES)}'}}), 400

    # Validate project_id if provided
    project_id = data.get('project_id')
    if project_id:
        if project_id not in projects_db:
            return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'Project not found'}}), 400

    job_id = generate_id()
    job = {
        'id': job_id,
        'prompt': prompt,
        'model': model,
        'type': job_type,
        'priority': priority,
        'status': 'queued',
        'created_at': now(),
        'updated_at': now(),
        'worker_id': None,
        'project_id': project_id,
        'result': None,
        'result_type': None,  # text, image, video - set by worker
        'tokens': None,
        'duration_seconds': None
    }

    jobs_db[job_id] = job

    # Add to Redis queue
    if redis_client:
        redis_client.lpush('job_queue', json.dumps(job))

    logger.info(f"Job {job_id} submitted (model: {job['model']}, from: {get_client_ip()})")

    # Emit WebSocket event
    socketio.emit('job:submitted', {'job_id': job_id})

    return jsonify({
        'job_id': job_id,
        'status': 'queued',
        'created_at': job['created_at']
    }), 201

@app.route(f'/api/{API_VERSION}/jobs', methods=['GET'])
@require_subnet
@require_api_key
def list_jobs():
    """List all jobs."""
    status = request.args.get('status')

    # Validate limit
    limit, error = validate_int(request.args.get('limit'), 'limit', min_val=1, max_val=500, default=50)
    if error:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': error}}), 400

    # Validate status if provided
    valid_statuses = {'queued', 'running', 'completed', 'failed', 'cancelled'}
    if status and status not in valid_statuses:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': f'status must be one of: {", ".join(valid_statuses)}'}}), 400

    jobs = list(jobs_db.values())

    if status:
        jobs = [j for j in jobs if j['status'] == status]

    # Sort by created_at descending
    jobs.sort(key=lambda x: x['created_at'], reverse=True)

    return jsonify({
        'jobs': jobs[:limit],
        'total': len(jobs)
    })

@app.route(f'/api/{API_VERSION}/jobs/<job_id>', methods=['GET'])
@require_subnet
@require_api_key
def get_job(job_id):
    """Get job details."""
    # Validate job_id format
    if not re.match(r'^[a-zA-Z0-9-]+$', job_id):
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'Invalid job_id format'}}), 400

    job = jobs_db.get(job_id)

    if not job:
        return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Job not found'}}), 404

    return jsonify(job)

@app.route(f'/api/{API_VERSION}/jobs/<job_id>/result', methods=['GET'])
@require_subnet
@require_api_key
def get_job_result(job_id):
    """Get job result."""
    # Validate job_id format
    if not re.match(r'^[a-zA-Z0-9-]+$', job_id):
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'Invalid job_id format'}}), 400

    job = jobs_db.get(job_id)

    if not job:
        return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Job not found'}}), 404

    if job['status'] != 'completed':
        return jsonify({'error': {'code': 'JOB_NOT_COMPLETED', 'message': 'Job not completed', 'status': job['status']}}), 400

    return jsonify({
        'job_id': job_id,
        'status': job['status'],
        'result': job['result'],
        'result_type': job.get('result_type'),
        'metadata': {
            'model': job['model'],
            'job_type': job.get('type', 'code'),
            'worker_id': job['worker_id'],
            'tokens': job['tokens'],
            'duration_seconds': job['duration_seconds']
        }
    })

@app.route(f'/api/{API_VERSION}/jobs/next', methods=['GET'])
@require_subnet
@require_api_key
def get_next_job():
    """Get next job for worker (polling endpoint)."""
    worker_id = request.args.get('worker_id')

    # Validate worker_id
    worker_id, error = validate_worker_id(worker_id)
    if error:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': error}}), 400

    # Verify worker is registered
    if worker_id not in workers_db:
        return jsonify({'error': {'code': 'WORKER_NOT_REGISTERED', 'message': 'Worker not registered'}}), 403

    # Find a queued job
    for job_id, job in jobs_db.items():
        if job['status'] == 'queued':
            # Assign to worker
            job['status'] = 'running'
            job['worker_id'] = worker_id
            job['updated_at'] = now()

            logger.info(f"Job {job_id} assigned to worker {worker_id}")

            return jsonify(job)

    # No jobs available
    return '', 204

@app.route(f'/api/{API_VERSION}/jobs/<job_id>/result', methods=['POST'])
@require_subnet
@require_api_key
def submit_result(job_id):
    """Submit job result from worker."""
    # Validate job_id format
    if not re.match(r'^[a-zA-Z0-9-]+$', job_id):
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'Invalid job_id format'}}), 400

    job = jobs_db.get(job_id)

    if not job:
        return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Job not found'}}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'Request body required'}}), 400

    # Validate result
    result, error = validate_string(data.get('result'), 'result', min_len=0, max_len=1000000, required=False)
    if error:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': error}}), 400

    # Validate tokens
    tokens, error = validate_int(data.get('tokens'), 'tokens', min_val=0, max_val=1000000, default=None)
    if error:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': error}}), 400

    # Validate duration
    duration, error = validate_int(data.get('duration_seconds'), 'duration_seconds', min_val=0, max_val=86400, default=None)
    if error:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': error}}), 400

    # Validate result_type
    result_type = data.get('result_type', 'text')
    valid_result_types = {'text', 'image', 'video'}
    if result_type not in valid_result_types:
        result_type = 'text'

    job['status'] = 'completed'
    job['result'] = result or ''
    job['result_type'] = result_type
    job['tokens'] = tokens
    job['duration_seconds'] = duration
    job['completed_at'] = now()
    job['updated_at'] = now()

    logger.info(f"Job {job_id} completed (tokens: {job['tokens']}, duration: {job['duration_seconds']}s)")

    # Emit WebSocket event
    socketio.emit(f'job:{job_id}:completed', {
        'job_id': job_id,
        'status': 'completed'
    })

    return jsonify({'success': True})

@app.route(f'/api/{API_VERSION}/jobs/<job_id>/progress', methods=['POST'])
@require_subnet
@require_api_key
def update_progress(job_id):
    """Update job progress from worker."""
    # Validate job_id format
    if not re.match(r'^[a-zA-Z0-9-]+$', job_id):
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'Invalid job_id format'}}), 400

    job = jobs_db.get(job_id)

    if not job:
        return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Job not found'}}), 404

    data = request.get_json() or {}

    # Validate progress values
    tokens, _ = validate_int(data.get('tokens'), 'tokens', min_val=0, max_val=1000000, default=0)
    percentage, _ = validate_int(data.get('percentage'), 'percentage', min_val=0, max_val=100, default=0)
    eta_seconds, _ = validate_int(data.get('eta_seconds'), 'eta_seconds', min_val=0, max_val=86400, default=None)

    # Emit progress via WebSocket
    socketio.emit(f'job:{job_id}:progress', {
        'job_id': job_id,
        'tokens': tokens,
        'percentage': percentage,
        'eta_seconds': eta_seconds
    })

    return jsonify({'success': True})

#===============================================================================
# API Routes - Workers
#===============================================================================

@app.route(f'/api/{API_VERSION}/workers/register', methods=['POST'])
@require_subnet
@require_api_key
def register_worker():
    """Register a new worker."""
    data = request.get_json()

    if not data:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'Request body required'}}), 400

    # Validate worker_id
    worker_id, error = validate_worker_id(data.get('worker_id'))
    if error:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': error}}), 400

    # Validate hostname
    hostname, error = validate_string(data.get('hostname', worker_id), 'hostname', max_len=255)
    if error:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': error}}), 400

    # Validate capabilities (basic structure check)
    capabilities = data.get('capabilities', {})
    if not isinstance(capabilities, dict):
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'capabilities must be an object'}}), 400

    worker = {
        'id': worker_id,
        'hostname': hostname,
        'capabilities': capabilities,
        'status': 'online',
        'current_job_id': None,
        'registered_at': now(),
        'last_heartbeat': now(),
        'ip_address': get_client_ip()
    }

    workers_db[worker_id] = worker

    logger.info(f"Worker {worker_id} registered from {get_client_ip()} (GPU: {worker['capabilities'].get('gpu', {}).get('type', 'cpu')})")

    # Emit WebSocket event
    socketio.emit('worker:registered', {'worker_id': worker_id})

    return jsonify({
        'worker_id': worker_id,
        'registered': True,
        'message': 'Worker registered successfully'
    })

@app.route(f'/api/{API_VERSION}/workers/<worker_id>/heartbeat', methods=['POST'])
@require_subnet
@require_api_key
def worker_heartbeat(worker_id):
    """Worker heartbeat."""
    # Validate worker_id
    worker_id, error = validate_worker_id(worker_id)
    if error:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': error}}), 400

    worker = workers_db.get(worker_id)

    if not worker:
        return jsonify({'error': {'code': 'WORKER_NOT_REGISTERED', 'message': 'Worker not registered'}}), 404

    data = request.get_json() or {}

    # Validate status
    valid_statuses = {'online', 'offline', 'busy', 'idle'}
    status = data.get('status', 'online')
    if status not in valid_statuses:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': f'status must be one of: {", ".join(valid_statuses)}'}}), 400

    worker['last_heartbeat'] = now()
    worker['status'] = status
    worker['current_job_id'] = data.get('current_job_id')

    return jsonify({
        'acknowledged': True,
        'instructions': None
    })

@app.route(f'/api/{API_VERSION}/workers', methods=['GET'])
@require_subnet
@require_api_key
def list_workers():
    """List all workers."""
    return jsonify({
        'workers': list(workers_db.values())
    })

#===============================================================================
# API Routes - Models
#===============================================================================

@app.route(f'/api/{API_VERSION}/models', methods=['GET'])
@require_subnet
@require_api_key
def list_models():
    """List available models from the models database."""
    # Return models from the in-memory database
    return jsonify({
        'models': list(models_db.values())
    })

@app.route(f'/api/{API_VERSION}/models/download', methods=['POST'])
@require_subnet
@require_api_key
def download_model():
    """Start model download from various sources."""
    data = request.get_json()

    if not data:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'Request body required'}}), 400

    # Validate model_id
    model_id, error = validate_model_id(data.get('model_id'))
    if error:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': error}}), 400

    url = data.get('url', '')
    provider = data.get('provider', 'huggingface')
    model_name = data.get('name', model_id)

    # Handle different source types
    if url.startswith('ollama://'):
        # Ollama library format: ollama://codellama:7b
        ollama_model = url.replace('ollama://', '')
        logger.info(f"Ollama model download requested: {ollama_model} (by {get_client_ip()})")

        # TODO: Implement Ollama pull
        # This would need: ollama pull codellama:7b
        # Then convert to GGUF or use Ollama's native format

        return jsonify({
            'model_id': model_id,
            'name': model_name,
            'provider': 'ollama',
            'status': 'downloading',
            'message': f'Ollama model {ollama_model} download queued'
        }), 202

    elif url.startswith('http://') or url.startswith('https://'):
        # Direct URL - validate source
        from urllib.parse import urlparse
        parsed_url = urlparse(url)

        # Trusted domains for model downloads
        trusted_domains = [
            'huggingface.co', 'cdn-lfs.huggingface.co', 'hf.co',
            'cdn.huggingface.co', 'storage.googleapis.com',
            'github.com', 'raw.githubusercontent.com'
        ]

        is_trusted = parsed_url.netloc in trusted_domains or \
                     any(parsed_url.netloc.endswith('.' + d) for d in trusted_domains)

        if not is_trusted:
            logger.warning(f"Untrusted model URL attempted: {url} from {get_client_ip()}")
            return jsonify({
                'error': {
                    'code': 'INVALID_INPUT',
                    'message': f'URL must be from trusted sources: {", ".join(trusted_domains[:4])}'
                }
            }), 400

        logger.info(f"Model download requested: {model_id} from {url} (by {get_client_ip()})")

        # Extract filename from URL
        filename = url.split('/')[-1] if '/' in url else f'{model_id}.gguf'
        size_gb = data.get('size_gb', 0)

        # Store model metadata
        models_db[model_id] = {
            'id': model_id,
            'name': model_name,
            'provider': provider,
            'url': url,
            'filename': filename,
            'size_gb': size_gb,
            'status': 'downloading',
            'download_progress': 0,
            'capabilities': data.get('capabilities', ['cpu', 'cuda', 'metal']),
            'created_at': now(),
            'last_used_at': None
        }

        # Start download in background thread
        download_thread = threading.Thread(
            target=download_model_background,
            args=(model_id, url, filename),
            daemon=True
        )
        download_thread.start()
        active_downloads[model_id] = download_thread

        return jsonify({
            'model_id': model_id,
            'name': model_name,
            'provider': provider,
            'status': 'downloading',
            'message': 'Download started'
        }), 202

    else:
        # Assume HuggingFace repo path format: "TheBloke/Llama-2-7B-GGUF"
        if '/' in url and not url.startswith('http'):
            hf_url = f"https://huggingface.co/{url}"
            logger.info(f"HuggingFace repo download requested: {url} (by {get_client_ip()})")

            return jsonify({
                'model_id': model_id,
                'name': model_name,
                'provider': 'huggingface',
                'status': 'downloading',
                'message': f'HuggingFace model from {url} download queued'
            }), 202

        return jsonify({
            'error': {
                'code': 'INVALID_INPUT',
                'message': 'Invalid URL format. Use HuggingFace URL, Ollama model name (ollama://model), or direct GGUF URL'
            }
        }), 400

@app.route(f'/api/{API_VERSION}/models/<model_id>', methods=['DELETE'])
@require_subnet
@require_api_key
def delete_model(model_id):
    """Delete a model."""
    # Validate model_id
    model_id, error = validate_model_id(model_id)
    if error:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': error}}), 400

    model = models_db.get(model_id)

    if not model:
        return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Model not found'}}), 404

    # Remove model file if it exists
    if model.get('filename'):
        model_path = os.path.join('/models', model['filename'])
        if os.path.exists(model_path):
            try:
                os.remove(model_path)
                logger.info(f"Deleted model file: {model_path}")
            except Exception as e:
                logger.error(f"Failed to delete model file: {e}")

    # Remove from database
    del models_db[model_id]

    logger.info(f"Model {model_id} deleted by {get_client_ip()}")

    return jsonify({'success': True, 'message': f'Model {model_id} deleted'})

@app.route(f'/api/{API_VERSION}/models/<model_id>/cancel', methods=['POST'])
@require_subnet
@require_api_key
def cancel_model_download(model_id):
    """Cancel an in-progress model download."""
    # Validate model_id
    model_id, error = validate_model_id(model_id)
    if error:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': error}}), 400

    model = models_db.get(model_id)

    if not model:
        return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Model not found'}}), 404

    if model.get('status') != 'downloading':
        return jsonify({'error': {'code': 'INVALID_STATE', 'message': 'Model is not downloading'}}), 400

    # Mark as cancelled and remove
    model['status'] = 'cancelled'
    del models_db[model_id]

    logger.info(f"Model download {model_id} cancelled by {get_client_ip()}")

    return jsonify({'success': True, 'message': f'Download of {model_id} cancelled'})

@app.route(f'/api/{API_VERSION}/models/<model_id>/status', methods=['GET'])
@require_subnet
@require_api_key
def get_model_status(model_id):
    """Get model download/status info."""
    # Validate model_id
    model_id, error = validate_model_id(model_id)
    if error:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': error}}), 400

    model = models_db.get(model_id)

    if not model:
        return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Model not found'}}), 404

    return jsonify(model)

#===============================================================================
# API Routes - Projects
#===============================================================================

def analyze_project_structure(project_path):
    """Analyze project structure and return metadata."""
    file_count = 0
    total_size = 0
    languages = set()
    structure = {}

    language_extensions = {
        '.py': 'python',
        '.js': 'javascript',
        '.ts': 'typescript',
        '.jsx': 'javascript',
        '.tsx': 'typescript',
        '.java': 'java',
        '.c': 'c',
        '.cpp': 'cpp',
        '.h': 'c',
        '.hpp': 'cpp',
        '.go': 'go',
        '.rs': 'rust',
        '.rb': 'ruby',
        '.php': 'php',
        '.swift': 'swift',
        '.kt': 'kotlin',
        '.cs': 'csharp',
        '.html': 'html',
        '.css': 'css',
        '.scss': 'scss',
        '.vue': 'vue',
        '.md': 'markdown',
        '.json': 'json',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.sql': 'sql',
        '.sh': 'shell',
        '.ps1': 'powershell'
    }

    for root, dirs, files in os.walk(project_path):
        # Skip common non-code directories
        dirs[:] = [d for d in dirs if d not in {'.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next', '.cache'}]

        rel_root = os.path.relpath(root, project_path)
        current_level = structure

        if rel_root != '.':
            for part in rel_root.split(os.sep):
                if part not in current_level:
                    current_level[part] = {}
                current_level = current_level[part]

        for file in files:
            file_path = os.path.join(root, file)
            try:
                file_size = os.path.getsize(file_path)
                total_size += file_size
                file_count += 1

                # Detect language
                ext = os.path.splitext(file)[1].lower()
                if ext in language_extensions:
                    languages.add(language_extensions[ext])

                current_level[file] = file_size
            except OSError:
                pass

    return {
        'file_count': file_count,
        'total_size': total_size,
        'languages': list(languages),
        'structure': structure
    }

@app.route(f'/api/{API_VERSION}/projects', methods=['GET'])
@require_subnet
@require_api_key
def list_projects():
    """List all uploaded projects."""
    return jsonify({
        'projects': list(projects_db.values())
    })

@app.route(f'/api/{API_VERSION}/projects/upload', methods=['POST'])
@require_subnet
@require_api_key
def upload_project():
    """Upload a project zip file."""
    if 'file' not in request.files:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'No file provided'}}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'No file selected'}}), 400

    if not file.filename.endswith('.zip'):
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'File must be a ZIP archive'}}), 400

    # Get project name from form data or filename
    project_name = request.form.get('name', '')
    if not project_name:
        project_name = os.path.splitext(secure_filename(file.filename))[0]

    project_name, error = validate_string(project_name, 'name', max_len=255)
    if error:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': error}}), 400

    description = request.form.get('description', '')

    # Check file size
    file.seek(0, 2)  # Seek to end
    file_size = file.tell()
    file.seek(0)  # Seek back to start

    if file_size > MAX_PROJECT_SIZE:
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': f'File size exceeds maximum of {MAX_PROJECT_SIZE // (1024*1024)}MB'}}), 400

    project_id = generate_id()

    # Create project directories
    project_dir = os.path.join(PROJECTS_PATH, project_id)
    extracted_path = os.path.join(project_dir, 'files')
    os.makedirs(extracted_path, exist_ok=True)

    # Save zip file
    zip_filename = secure_filename(file.filename)
    zip_path = os.path.join(project_dir, zip_filename)
    file.save(zip_path)

    # Extract zip file
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extracted_path)
        logger.info(f"Project {project_id} extracted to {extracted_path}")
    except zipfile.BadZipFile:
        # Clean up on error
        shutil.rmtree(project_dir, ignore_errors=True)
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'Invalid ZIP file'}}), 400

    # Analyze project structure
    analysis = analyze_project_structure(extracted_path)

    # Store project metadata
    project = {
        'id': project_id,
        'name': project_name,
        'description': description,
        'zip_filename': zip_filename,
        'extracted_path': extracted_path,
        'size_bytes': file_size,
        'file_count': analysis['file_count'],
        'languages': analysis['languages'],
        'structure': analysis['structure'],
        'analyzed': True,
        'use_count': 0,
        'created_at': now(),
        'updated_at': now(),
        'last_used_at': None
    }

    projects_db[project_id] = project

    logger.info(f"Project {project_id} uploaded: {project_name} ({analysis['file_count']} files, {file_size} bytes) by {get_client_ip()}")

    return jsonify({
        'project_id': project_id,
        'name': project_name,
        'status': 'uploaded',
        'file_count': analysis['file_count'],
        'languages': analysis['languages'],
        'message': 'Project uploaded and analyzed successfully'
    }), 201

@app.route(f'/api/{API_VERSION}/projects/<project_id>', methods=['GET'])
@require_subnet
@require_api_key
def get_project(project_id):
    """Get project details."""
    if not re.match(r'^[a-zA-Z0-9-]+$', project_id):
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'Invalid project_id format'}}), 400

    project = projects_db.get(project_id)

    if not project:
        return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Project not found'}}), 404

    return jsonify(project)

@app.route(f'/api/{API_VERSION}/projects/<project_id>', methods=['DELETE'])
@require_subnet
@require_api_key
def delete_project(project_id):
    """Delete a project."""
    if not re.match(r'^[a-zA-Z0-9-]+$', project_id):
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'Invalid project_id format'}}), 400

    project = projects_db.get(project_id)

    if not project:
        return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Project not found'}}), 404

    # Remove project directory
    project_dir = os.path.join(PROJECTS_PATH, project_id)
    if os.path.exists(project_dir):
        try:
            shutil.rmtree(project_dir)
            logger.info(f"Deleted project directory: {project_dir}")
        except Exception as e:
            logger.error(f"Failed to delete project directory: {e}")

    # Remove from database
    del projects_db[project_id]

    logger.info(f"Project {project_id} deleted by {get_client_ip()}")

    return jsonify({'success': True, 'message': f'Project {project_id} deleted'})

@app.route(f'/api/{API_VERSION}/projects/<project_id>/files/<path:file_path>', methods=['GET'])
@require_subnet
@require_api_key
def get_project_file(project_id, file_path):
    """Get a file from a project."""
    if not re.match(r'^[a-zA-Z0-9-]+$', project_id):
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'Invalid project_id format'}}), 400

    project = projects_db.get(project_id)

    if not project:
        return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Project not found'}}), 404

    # Construct full path and validate it's within project directory
    full_path = os.path.normpath(os.path.join(project['extracted_path'], file_path))

    # Security: Ensure the path is within the project directory
    if not full_path.startswith(os.path.normpath(project['extracted_path'])):
        return jsonify({'error': {'code': 'FORBIDDEN', 'message': 'Access denied'}}), 403

    if not os.path.exists(full_path):
        return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'File not found'}}), 404

    if os.path.isdir(full_path):
        # Return directory listing
        files = []
        for item in os.listdir(full_path):
            item_path = os.path.join(full_path, item)
            files.append({
                'name': item,
                'is_dir': os.path.isdir(item_path),
                'size': os.path.getsize(item_path) if os.path.isfile(item_path) else None
            })
        return jsonify({'files': files})

    # Return file content
    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return jsonify({
            'path': file_path,
            'content': content,
            'size': os.path.getsize(full_path)
        })
    except UnicodeDecodeError:
        # Binary file
        return jsonify({'error': {'code': 'BINARY_FILE', 'message': 'Cannot read binary file as text'}}), 400

@app.route(f'/api/{API_VERSION}/projects/<project_id>/download', methods=['GET'])
@require_subnet
@require_api_key
def download_project(project_id):
    """Download the project zip file."""
    if not re.match(r'^[a-zA-Z0-9-]+$', project_id):
        return jsonify({'error': {'code': 'INVALID_INPUT', 'message': 'Invalid project_id format'}}), 400

    project = projects_db.get(project_id)

    if not project:
        return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Project not found'}}), 404

    zip_path = os.path.join(PROJECTS_PATH, project_id, project['zip_filename'])

    if not os.path.exists(zip_path):
        return jsonify({'error': {'code': 'NOT_FOUND', 'message': 'Project file not found'}}), 404

    return send_file(
        zip_path,
        mimetype='application/zip',
        as_attachment=True,
        download_name=project['zip_filename']
    )

#===============================================================================
# Setup Endpoints (Worker Downloads)
#===============================================================================

@app.route('/setup/worker.py', methods=['GET'])
@require_subnet
def serve_worker_script():
    """Serve worker.py for workers to download (subnet restricted, no API key)."""
    worker_script = os.path.join(os.path.dirname(__file__), '..', 'worker', 'worker.py')

    logger.info(f"Worker script requested from {get_client_ip()}")

    if os.path.exists(worker_script):
        return send_file(worker_script, mimetype='text/x-python')

    # Return a placeholder if worker.py doesn't exist yet
    return Response('''#!/usr/bin/env python3
"""AI Cluster Worker - Placeholder"""
print("Worker script not yet deployed")
''', mimetype='text/x-python')

@app.route('/setup/worker-version.txt', methods=['GET'])
@require_subnet
def worker_version():
    """Return worker script version (subnet restricted, no API key)."""
    return Response('1.0.0', mimetype='text/plain')

#===============================================================================
# WebSocket Events
#===============================================================================

@socketio.on('connect')
def handle_connect():
    """Handle WebSocket connection."""
    logger.info(f"WebSocket client connected")

@socketio.on('disconnect')
def handle_disconnect():
    """Handle WebSocket disconnection."""
    logger.info(f"WebSocket client disconnected")

@socketio.on('subscribe')
def handle_subscribe(job_id):
    """Subscribe to job updates."""
    logger.info(f"Client subscribed to job: {job_id}")

#===============================================================================
# Main
#===============================================================================

if __name__ == '__main__':
    # Create directories
    for path in [MODELS_PATH, RESULTS_PATH, PROJECTS_PATH]:
        os.makedirs(path, exist_ok=True)

    logger.info(f"Starting AI Cluster Coordinator (API {API_VERSION})")
    logger.info(f"Models path: {MODELS_PATH}")
    logger.info(f"Results path: {RESULTS_PATH}")

    # Security configuration logging
    logger.info(f"Allowed subnet: {ALLOWED_SUBNET}")
    if API_KEY:
        logger.info("API key authentication: ENABLED")
    elif AUTH_DISABLED:
        logger.warning("=" * 60)
        logger.warning("WARNING: API authentication is DISABLED (AUTH_DISABLED=true)")
        logger.warning("This should only be used for testing/development!")
        logger.warning("=" * 60)
    else:
        logger.error("=" * 60)
        logger.error("ERROR: API_KEY not configured!")
        logger.error("Set API_KEY environment variable or AUTH_DISABLED=true for testing")
        logger.error("API endpoints will return 500 errors until configured")
        logger.error("=" * 60)

    # Run with SocketIO
    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=os.environ.get('FLASK_ENV') == 'development'
    )
