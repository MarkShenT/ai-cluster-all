"""
Tests for the AI Cluster worker.
"""

import os
import sys
import platform
import pytest
from unittest.mock import patch, MagicMock

# Add worker to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'worker'))


class TestEnvironmentDetection:
    """Tests for environment detection functions."""

    def test_detect_environment_returns_dict(self):
        """detect_environment should return a dictionary."""
        from worker import detect_environment
        env = detect_environment()
        assert isinstance(env, dict)

    def test_detect_environment_has_os(self):
        """detect_environment should include OS info."""
        from worker import detect_environment
        env = detect_environment()
        assert 'os' in env
        assert env['os'] == platform.system().lower()

    def test_detect_environment_has_arch(self):
        """detect_environment should include architecture."""
        from worker import detect_environment
        env = detect_environment()
        assert 'arch' in env
        assert env['arch'] == platform.machine()

    def test_detect_environment_has_hostname(self):
        """detect_environment should include hostname."""
        from worker import detect_environment
        env = detect_environment()
        assert 'hostname' in env

    def test_detect_environment_has_ram(self):
        """detect_environment should include RAM info."""
        from worker import detect_environment
        env = detect_environment()
        assert 'ram_gb' in env
        assert env['ram_gb'] > 0

    def test_detect_environment_has_cpu_count(self):
        """detect_environment should include CPU count."""
        from worker import detect_environment
        env = detect_environment()
        assert 'cpu_count' in env
        assert env['cpu_count'] > 0

    def test_detect_environment_has_gpu_info(self):
        """detect_environment should include GPU info."""
        from worker import detect_environment
        env = detect_environment()
        assert 'gpu' in env
        assert 'type' in env['gpu']

    def test_detect_environment_has_supported_models(self):
        """detect_environment should include supported models."""
        from worker import detect_environment
        env = detect_environment()
        assert 'supported_models' in env


class TestGpuDetection:
    """Tests for GPU detection."""

    def test_detect_gpu_returns_dict(self):
        """detect_gpu should return a dictionary."""
        from worker import detect_gpu
        gpu = detect_gpu()
        assert isinstance(gpu, dict)

    def test_detect_gpu_has_type(self):
        """detect_gpu should have type field."""
        from worker import detect_gpu
        gpu = detect_gpu()
        assert 'type' in gpu
        assert gpu['type'] in ('cpu', 'cuda', 'metal')

    def test_detect_gpu_has_model(self):
        """detect_gpu should have model field."""
        from worker import detect_gpu
        gpu = detect_gpu()
        assert 'model' in gpu

    def test_detect_gpu_has_vram(self):
        """detect_gpu should have vram_gb field."""
        from worker import detect_gpu
        gpu = detect_gpu()
        assert 'vram_gb' in gpu
        assert isinstance(gpu['vram_gb'], (int, float))

    @patch('subprocess.run')
    def test_detect_gpu_nvidia(self, mock_run):
        """detect_gpu should detect NVIDIA GPU."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='NVIDIA GeForce RTX 3080,12288 MiB'
        )
        from worker import detect_gpu
        gpu = detect_gpu()
        assert gpu['type'] == 'cuda'
        assert 'RTX 3080' in gpu['model']
        assert gpu['vram_gb'] == 12

    @patch('subprocess.run')
    def test_detect_gpu_no_nvidia(self, mock_run):
        """detect_gpu should handle missing nvidia-smi."""
        from subprocess import TimeoutExpired
        mock_run.side_effect = FileNotFoundError()
        from worker import detect_gpu
        gpu = detect_gpu()
        # Should fall back to CPU or Metal depending on platform
        assert gpu['type'] in ('cpu', 'metal')


class TestSupportedModels:
    """Tests for model support determination."""

    def test_determine_supported_models_with_cuda(self):
        """High VRAM CUDA GPU should support large models."""
        from worker import determine_supported_models
        env = {
            'gpu': {'type': 'cuda', 'vram_gb': 24},
            'ram_gb': 64
        }
        models = determine_supported_models(env)
        assert isinstance(models, list)

    def test_determine_supported_models_with_cpu(self):
        """CPU-only should support smaller models based on RAM."""
        from worker import determine_supported_models
        env = {
            'gpu': {'type': 'cpu', 'vram_gb': 0},
            'ram_gb': 32
        }
        models = determine_supported_models(env)
        assert isinstance(models, list)

    def test_determine_supported_models_low_ram(self):
        """Low RAM system should have limited model support."""
        from worker import determine_supported_models
        env = {
            'gpu': {'type': 'cpu', 'vram_gb': 0},
            'ram_gb': 4
        }
        models = determine_supported_models(env)
        assert isinstance(models, list)


class TestWorkerConfiguration:
    """Tests for worker configuration."""

    def test_heartbeat_interval_defined(self):
        """HEARTBEAT_INTERVAL should be defined."""
        from worker import HEARTBEAT_INTERVAL
        assert HEARTBEAT_INTERVAL > 0

    def test_poll_interval_defined(self):
        """POLL_INTERVAL should be defined."""
        from worker import POLL_INTERVAL
        assert POLL_INTERVAL > 0

    def test_model_cache_dir_defined(self):
        """MODEL_CACHE_DIR should be defined."""
        from worker import MODEL_CACHE_DIR
        assert MODEL_CACHE_DIR is not None


class TestWorkerApiKey:
    """Tests for API key handling."""

    def test_api_key_from_env(self):
        """API_KEY should be read from environment."""
        from worker import API_KEY
        # Just verify it's a string (could be empty if not set)
        assert isinstance(API_KEY, str)

    @patch.dict(os.environ, {'API_KEY': 'test-key-123'})
    def test_api_key_set(self):
        """API_KEY should be set when environment variable exists."""
        # Need to reimport to pick up new env var
        import importlib
        import worker
        importlib.reload(worker)
        assert worker.API_KEY == 'test-key-123'
