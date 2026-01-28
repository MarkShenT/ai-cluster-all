"""
Coordinator-specific pytest fixtures.
"""

import os
import sys
import pytest

# Ensure coordinator module is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'coordinator'))


@pytest.fixture
def app(mock_env):
    """Create Flask application for testing."""
    # Import here to ensure environment is set up first
    from app import app as flask_app

    flask_app.config['TESTING'] = True
    flask_app.config['DEBUG'] = False

    yield flask_app


@pytest.fixture
def client(app):
    """Create Flask test client."""
    return app.test_client()


@pytest.fixture
def api_headers():
    """Return headers for API requests."""
    return {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-api-key'
    }
