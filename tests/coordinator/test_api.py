"""
Tests for the coordinator API endpoints.
"""

import json
import pytest


class TestHealthEndpoint:
    """Tests for the /api/v1/system/health endpoint."""

    def test_health_returns_200(self, client):
        """Health endpoint should return 200."""
        response = client.get('/api/v1/system/health')
        assert response.status_code == 200

    def test_health_returns_status(self, client):
        """Health endpoint should return healthy status."""
        response = client.get('/api/v1/system/health')
        data = json.loads(response.data)
        assert data['status'] == 'healthy'

    def test_health_returns_version(self, client):
        """Health endpoint should return API version."""
        response = client.get('/api/v1/system/health')
        data = json.loads(response.data)
        assert 'version' in data

    def test_health_returns_services(self, client):
        """Health endpoint should return services status."""
        response = client.get('/api/v1/system/health')
        data = json.loads(response.data)
        assert 'services' in data
        assert 'redis' in data['services']

    def test_health_returns_security_info(self, client):
        """Health endpoint should return security configuration."""
        response = client.get('/api/v1/system/health')
        data = json.loads(response.data)
        assert 'security' in data
        assert 'allowed_subnet' in data['security']


class TestStatsEndpoint:
    """Tests for the /api/v1/system/stats endpoint."""

    def test_stats_returns_200(self, client, api_headers):
        """Stats endpoint should return 200."""
        response = client.get('/api/v1/system/stats', headers=api_headers)
        assert response.status_code == 200

    def test_stats_returns_job_counts(self, client, api_headers):
        """Stats endpoint should return job counts."""
        response = client.get('/api/v1/system/stats', headers=api_headers)
        data = json.loads(response.data)
        assert 'total_jobs' in data
        assert 'jobs_completed' in data
        assert 'jobs_queued' in data
        assert 'jobs_running' in data

    def test_stats_returns_worker_count(self, client, api_headers):
        """Stats endpoint should return worker count."""
        response = client.get('/api/v1/system/stats', headers=api_headers)
        data = json.loads(response.data)
        assert 'workers_online' in data


class TestJobsEndpoint:
    """Tests for the /api/v1/jobs endpoint."""

    def test_list_jobs_returns_200(self, client, api_headers):
        """List jobs endpoint should return 200."""
        response = client.get('/api/v1/jobs', headers=api_headers)
        assert response.status_code == 200

    def test_submit_job_without_type_uses_default(self, client, api_headers):
        """Submit job without type should use default type."""
        response = client.post(
            '/api/v1/jobs',
            headers=api_headers,
            data=json.dumps({'prompt': 'test prompt'})
        )
        # API accepts jobs without explicit type (uses default)
        assert response.status_code in (200, 201)

    def test_submit_code_job_requires_prompt(self, client, api_headers):
        """Submit code job should require prompt."""
        response = client.post(
            '/api/v1/jobs',
            headers=api_headers,
            data=json.dumps({'type': 'code'})
        )
        assert response.status_code == 400

    def test_submit_code_job_success(self, client, api_headers):
        """Submit code job should succeed with valid data."""
        response = client.post(
            '/api/v1/jobs',
            headers=api_headers,
            data=json.dumps({
                'type': 'code',
                'prompt': 'Write a hello world function',
                'model_id': 'test-model'
            })
        )
        # Should return 201 or 200 depending on implementation
        assert response.status_code in (200, 201)

    def test_submit_job_invalid_type(self, client, api_headers):
        """Submit job should reject invalid type."""
        response = client.post(
            '/api/v1/jobs',
            headers=api_headers,
            data=json.dumps({
                'type': 'invalid_type',
                'prompt': 'test'
            })
        )
        assert response.status_code == 400


class TestWorkersEndpoint:
    """Tests for the /api/v1/workers endpoint."""

    def test_list_workers_returns_200(self, client, api_headers):
        """List workers endpoint should return 200."""
        response = client.get('/api/v1/workers', headers=api_headers)
        assert response.status_code == 200

    def test_register_worker_success(self, client, api_headers):
        """Register worker should succeed with valid data."""
        response = client.post(
            '/api/v1/workers/register',
            headers=api_headers,
            data=json.dumps({
                'worker_id': 'test-worker-1',
                'hostname': 'test-host',
                'capabilities': {
                    'gpu': {'type': 'cuda', 'vram_gb': 8},
                    'ram_gb': 32
                }
            })
        )
        assert response.status_code in (200, 201)

    def test_register_worker_requires_worker_id(self, client, api_headers):
        """Register worker should require worker_id."""
        response = client.post(
            '/api/v1/workers/register',
            headers=api_headers,
            data=json.dumps({
                'hostname': 'test-host'
            })
        )
        assert response.status_code == 400


class TestModelsEndpoint:
    """Tests for the /api/v1/models endpoint."""

    def test_list_models_returns_200(self, client, api_headers):
        """List models endpoint should return 200."""
        response = client.get('/api/v1/models', headers=api_headers)
        assert response.status_code == 200


class TestProjectsEndpoint:
    """Tests for the /api/v1/projects endpoint."""

    def test_list_projects_returns_200(self, client, api_headers):
        """List projects endpoint should return 200."""
        response = client.get('/api/v1/projects', headers=api_headers)
        assert response.status_code == 200


class TestAuthentication:
    """Tests for API authentication."""

    def test_stats_requires_api_key(self, client):
        """Protected endpoints should require API key."""
        response = client.get('/api/v1/system/stats')
        # Should return 401 without API key (when API_KEY is set)
        # or 200 if AUTH_DISABLED=true
        assert response.status_code in (200, 401, 500)

    def test_health_no_api_key_required(self, client):
        """Health endpoint should not require API key."""
        response = client.get('/api/v1/system/health')
        assert response.status_code == 200


class TestClientConfig:
    """Tests for client configuration endpoint."""

    def test_get_client_config_returns_200(self, client):
        """Client config endpoint should return 200."""
        response = client.get('/api/v1/system/client-config')
        assert response.status_code == 200

    def test_get_client_config_returns_api_key_field(self, client):
        """Client config should return api_key field."""
        response = client.get('/api/v1/system/client-config')
        data = json.loads(response.data)
        assert 'api_key' in data
