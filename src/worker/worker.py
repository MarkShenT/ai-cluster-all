#!/usr/bin/env python3
# Dual License - AGPL-3.0 or Commercial - Copyright (c) 2025 MarkShenT
# See LICENSE file for details
"""
AI Cluster Worker
=================
Universal worker script for Windows, macOS, and Linux.
Downloads models from coordinator and runs inference using llama-cpp-python.

Security:
- Requires API_KEY for all coordinator communication
- API key should match the coordinator's API_KEY setting
"""

import os
import sys
import json
import time
import socket
import logging
import argparse
import platform
import threading
from pathlib import Path

import requests
import psutil

# Configuration
HEARTBEAT_INTERVAL = 30  # seconds
POLL_INTERVAL = 5  # seconds
MODEL_CACHE_DIR = Path.home() / '.ai-worker' / 'models'
API_KEY = os.environ.get('API_KEY', '')

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

#===============================================================================
# Environment Detection
#===============================================================================

def detect_environment():
    """Detect system capabilities."""
    env = {
        'os': platform.system().lower(),
        'arch': platform.machine(),
        'hostname': socket.gethostname(),
        'ram_gb': psutil.virtual_memory().total // (1024**3),
        'cpu_count': psutil.cpu_count(),
        'gpu': detect_gpu()
    }

    # Determine supported models based on hardware
    env['supported_models'] = determine_supported_models(env)

    return env

def detect_gpu():
    """Detect GPU type and capabilities."""
    gpu_info = {
        'type': 'cpu',
        'model': None,
        'vram_gb': 0
    }

    # Check for NVIDIA GPU
    try:
        import subprocess
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader'],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            parts = result.stdout.strip().split(',')
            gpu_info['type'] = 'cuda'
            gpu_info['model'] = parts[0].strip()
            # Parse VRAM (e.g., "12288 MiB" -> 12)
            vram_str = parts[1].strip() if len(parts) > 1 else '0'
            vram_mb = int(''.join(filter(str.isdigit, vram_str)) or 0)
            gpu_info['vram_gb'] = vram_mb // 1024
            return gpu_info
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        pass

    # Check for Apple Silicon (Metal)
    if platform.system() == 'Darwin' and platform.machine() == 'arm64':
        gpu_info['type'] = 'metal'
        gpu_info['model'] = 'Apple Neural Engine'
        # Unified memory - use system RAM
        gpu_info['vram_gb'] = psutil.virtual_memory().total // (1024**3)
        return gpu_info

    return gpu_info

def determine_supported_models(env):
    """Determine which models this hardware can run."""
    models = []
    ram_gb = env['ram_gb']
    gpu_type = env['gpu']['type']
    vram_gb = env['gpu']['vram_gb']

    # Small models (always supported)
    models.extend(['6.7b', '7b'])

    # Medium models
    if ram_gb >= 16 or vram_gb >= 8:
        models.extend(['13b', '14b'])

    # Large models (need GPU or lots of RAM)
    if (gpu_type == 'cuda' and vram_gb >= 12) or ram_gb >= 32:
        models.extend(['32b', '33b', '34b'])

    # Very large models (need lots of RAM for CPU offload)
    if ram_gb >= 64:
        models.append('70b')

    return models

#===============================================================================
# Worker Class
#===============================================================================

class Worker:
    """AI Cluster Worker."""

    def __init__(self, coordinator_url, worker_id, gpu_type='auto', api_key=''):
        self.coordinator_url = coordinator_url.rstrip('/')
        self.worker_id = worker_id
        self.gpu_type_override = gpu_type
        self.api_key = api_key or API_KEY

        # Detect environment
        self.env = detect_environment()
        if gpu_type != 'auto':
            self.env['gpu']['type'] = gpu_type

        # State
        self.running = True
        self.current_job = None
        self.llm = None
        self.current_model = None

        # Ensure cache directory exists
        MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)

        logger.info(f"Worker initialized: {self.worker_id}")
        logger.info(f"OS: {self.env['os']}, RAM: {self.env['ram_gb']}GB")
        logger.info(f"GPU: {self.env['gpu']['type']} ({self.env['gpu']['model']})")
        logger.info(f"Supported models: {self.env['supported_models']}")
        logger.info(f"API Key configured: {'Yes' if self.api_key else 'No'}")

    def _get_headers(self):
        """Get headers for API requests including API key."""
        headers = {'Content-Type': 'application/json'}
        if self.api_key:
            headers['X-API-Key'] = self.api_key
        return headers

    def register(self):
        """Register with coordinator."""
        try:
            response = requests.post(
                f"{self.coordinator_url}/api/v1/workers/register",
                headers=self._get_headers(),
                json={
                    'worker_id': self.worker_id,
                    'hostname': self.env['hostname'],
                    'capabilities': {
                        'os': self.env['os'],
                        'gpu': self.env['gpu'],
                        'cpu': {
                            'cores': self.env['cpu_count']
                        },
                        'ram_gb': self.env['ram_gb'],
                        'supported_models': self.env['supported_models'],
                        'worker_types': ['inference']
                    }
                },
                timeout=10
            )
            if response.status_code == 401:
                logger.error("Authentication failed - check API_KEY configuration")
                return False
            if response.status_code == 403:
                logger.error("Access denied - worker IP not in allowed subnet")
                return False
            response.raise_for_status()
            logger.info(f"Registered with coordinator")
            return True
        except requests.exceptions.RequestException as e:
            logger.error(f"Registration failed: {e}")
            return False

    def heartbeat(self):
        """Send heartbeat to coordinator."""
        try:
            response = requests.post(
                f"{self.coordinator_url}/api/v1/workers/{self.worker_id}/heartbeat",
                headers=self._get_headers(),
                json={
                    'status': 'busy' if self.current_job else 'idle',
                    'current_job_id': self.current_job['id'] if self.current_job else None,
                    'system_load': {
                        'cpu_percent': psutil.cpu_percent(),
                        'ram_percent': psutil.virtual_memory().percent
                    }
                },
                timeout=5
            )
            return response.status_code == 200
        except Exception as e:
            logger.warning(f"Heartbeat failed: {e}")
            return False

    def get_next_job(self):
        """Poll for next job."""
        try:
            response = requests.get(
                f"{self.coordinator_url}/api/v1/jobs/next",
                headers=self._get_headers(),
                params={'worker_id': self.worker_id},
                timeout=10
            )
            if response.status_code == 200:
                return response.json()
            return None
        except Exception as e:
            logger.warning(f"Job poll failed: {e}")
            return None

    def ensure_model(self, model_name):
        """Ensure model is downloaded and loaded."""
        model_path = MODEL_CACHE_DIR / f"{model_name}.gguf"

        # Download if not cached
        if not model_path.exists():
            logger.info(f"Downloading model: {model_name}")
            try:
                response = requests.get(
                    f"{self.coordinator_url}/models/download/{model_name}",
                    stream=True,
                    timeout=30
                )
                response.raise_for_status()

                total_size = int(response.headers.get('content-length', 0))
                downloaded = 0

                with open(model_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size:
                            percent = (downloaded / total_size) * 100
                            print(f"\rDownloading: {percent:.1f}%", end='', flush=True)

                print()  # New line after progress
                logger.info(f"Model downloaded: {model_name}")
            except Exception as e:
                logger.error(f"Model download failed: {e}")
                return False

        # Load model if not already loaded or different model
        if self.current_model != model_name:
            return self.load_model(str(model_path), model_name)

        return True

    def load_model(self, model_path, model_name):
        """Load model with llama-cpp-python."""
        try:
            from llama_cpp import Llama

            logger.info(f"Loading model: {model_name}")

            # Determine GPU layers
            n_gpu_layers = 0
            if self.env['gpu']['type'] == 'cuda':
                n_gpu_layers = -1  # All layers on GPU
            elif self.env['gpu']['type'] == 'metal':
                n_gpu_layers = -1  # All layers on Metal

            self.llm = Llama(
                model_path=model_path,
                n_ctx=4096,
                n_gpu_layers=n_gpu_layers,
                verbose=False
            )
            self.current_model = model_name
            logger.info(f"Model loaded: {model_name}")
            return True

        except ImportError:
            logger.error("llama-cpp-python not installed")
            return False
        except Exception as e:
            logger.error(f"Model load failed: {e}")
            return False

    def process_job(self, job):
        """Process a job."""
        self.current_job = job
        job_id = job['id']
        model = job.get('model', '34b')

        logger.info(f"Processing job {job_id} (model: {model})")

        try:
            # Ensure model is ready
            if not self.ensure_model(model):
                raise Exception(f"Could not load model: {model}")

            # Run inference
            start_time = time.time()

            response = self.llm(
                prompt=job['prompt'],
                max_tokens=2000,
                temperature=0.7,
                stop=["</s>", "[/INST]"]
            )

            duration = time.time() - start_time
            result = response['choices'][0]['text']
            tokens = response['usage']['completion_tokens']

            # Submit result
            self.submit_result(job_id, result, tokens, duration)

            logger.info(f"Job {job_id} completed ({tokens} tokens in {duration:.1f}s)")

        except Exception as e:
            logger.error(f"Job {job_id} failed: {e}")
            self.submit_failure(job_id, str(e))

        finally:
            self.current_job = None

    def submit_result(self, job_id, result, tokens, duration):
        """Submit job result."""
        try:
            requests.post(
                f"{self.coordinator_url}/api/v1/jobs/{job_id}/result",
                headers=self._get_headers(),
                json={
                    'result': result,
                    'tokens': tokens,
                    'duration_seconds': round(duration, 2)
                },
                timeout=30
            )
        except Exception as e:
            logger.error(f"Failed to submit result: {e}")

    def submit_failure(self, job_id, error_message):
        """Submit job failure."""
        try:
            requests.post(
                f"{self.coordinator_url}/api/v1/jobs/{job_id}/result",
                headers=self._get_headers(),
                json={
                    'result': None,
                    'error': error_message,
                    'status': 'failed'
                },
                timeout=10
            )
        except Exception as e:
            logger.error(f"Failed to submit failure: {e}")

    def heartbeat_loop(self):
        """Background heartbeat loop."""
        while self.running:
            self.heartbeat()
            time.sleep(HEARTBEAT_INTERVAL)

    def run(self):
        """Main worker loop."""
        # Register with coordinator
        if not self.register():
            logger.error("Failed to register, retrying in 10s...")
            time.sleep(10)
            if not self.register():
                logger.error("Registration failed, exiting")
                return

        # Start heartbeat thread
        heartbeat_thread = threading.Thread(target=self.heartbeat_loop, daemon=True)
        heartbeat_thread.start()

        logger.info("Worker started, polling for jobs...")

        # Main loop
        while self.running:
            try:
                job = self.get_next_job()
                if job:
                    self.process_job(job)
                else:
                    time.sleep(POLL_INTERVAL)
            except KeyboardInterrupt:
                logger.info("Shutting down...")
                self.running = False
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                time.sleep(POLL_INTERVAL)

        logger.info("Worker stopped")

#===============================================================================
# Main
#===============================================================================

def main():
    parser = argparse.ArgumentParser(description='AI Cluster Worker')
    parser.add_argument('--coordinator', required=True, help='Coordinator URL')
    parser.add_argument('--worker-id', default=socket.gethostname(), help='Worker ID')
    parser.add_argument('--gpu-type', default='auto', choices=['auto', 'cuda', 'metal', 'cpu'],
                        help='GPU type (auto-detected by default)')
    parser.add_argument('--api-key', default='', help='API key for coordinator authentication (can also use API_KEY env var)')
    parser.add_argument('--test', action='store_true', help='Test mode (exit after registration)')

    args = parser.parse_args()

    # Use command line arg or env var
    api_key = args.api_key or os.environ.get('API_KEY', '')

    if not api_key:
        logger.warning("No API key provided - requests may fail if coordinator requires authentication")
        logger.warning("Set API_KEY environment variable or use --api-key argument")

    worker = Worker(
        coordinator_url=args.coordinator,
        worker_id=args.worker_id,
        gpu_type=args.gpu_type,
        api_key=api_key
    )

    if args.test:
        if worker.register():
            logger.info("Test successful")
            sys.exit(0)
        else:
            sys.exit(1)

    worker.run()

if __name__ == '__main__':
    main()
