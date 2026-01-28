"""
Shared pytest fixtures for AI Cluster tests.
"""

import os
import sys
import tempfile
import pytest

# Add src directories to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src', 'coordinator'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src', 'worker'))


@pytest.fixture
def temp_dir():
    """Create a temporary directory for test files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


@pytest.fixture
def mock_env(monkeypatch, temp_dir):
    """Set up mock environment variables."""
    monkeypatch.setenv('AUTH_DISABLED', 'true')
    monkeypatch.setenv('MODELS_PATH', os.path.join(temp_dir, 'models'))
    monkeypatch.setenv('RESULTS_PATH', os.path.join(temp_dir, 'results'))
    monkeypatch.setenv('PROJECTS_PATH', os.path.join(temp_dir, 'projects'))
    monkeypatch.setenv('DATABASE_URL', f'sqlite:///{temp_dir}/test.db')
    monkeypatch.setenv('ALLOWED_SUBNET', '0.0.0.0/0')  # Allow all for testing

    # Create directories
    os.makedirs(os.path.join(temp_dir, 'models'), exist_ok=True)
    os.makedirs(os.path.join(temp_dir, 'results'), exist_ok=True)
    os.makedirs(os.path.join(temp_dir, 'projects'), exist_ok=True)

    yield temp_dir
