"""
Tests for input validation functions in the coordinator.
"""

import os
import sys
import pytest

# Add coordinator to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'coordinator'))


class TestStringValidation:
    """Tests for validate_string function."""

    def test_valid_string(self):
        """Valid string should pass validation."""
        from app import validate_string
        value, error = validate_string("hello world", "test")
        assert value == "hello world"
        assert error is None

    def test_empty_string_required(self):
        """Empty string should fail when required."""
        from app import validate_string
        value, error = validate_string("", "test")
        assert error is not None
        assert "at least" in error

    def test_none_required(self):
        """None should fail when required."""
        from app import validate_string
        value, error = validate_string(None, "test")
        assert error is not None
        assert "required" in error

    def test_none_optional(self):
        """None should pass when not required."""
        from app import validate_string
        value, error = validate_string(None, "test", required=False)
        assert value == ""
        assert error is None

    def test_too_long_string(self):
        """String exceeding max length should fail."""
        from app import validate_string
        value, error = validate_string("a" * 100, "test", max_len=50)
        assert error is not None
        assert "at most" in error

    def test_strips_whitespace(self):
        """String should be stripped of whitespace."""
        from app import validate_string
        value, error = validate_string("  hello  ", "test")
        assert value == "hello"
        assert error is None

    def test_non_string_type(self):
        """Non-string values should fail."""
        from app import validate_string
        value, error = validate_string(123, "test")
        assert error is not None
        assert "must be a string" in error


class TestIntValidation:
    """Tests for validate_int function."""

    def test_valid_int(self):
        """Valid integer should pass validation."""
        from app import validate_int
        value, error = validate_int(42, "test")
        assert value == 42
        assert error is None

    def test_string_int(self):
        """String integer should be converted."""
        from app import validate_int
        value, error = validate_int("42", "test")
        assert value == 42
        assert error is None

    def test_none_with_default(self):
        """None should return default."""
        from app import validate_int
        value, error = validate_int(None, "test", default=10)
        assert value == 10
        assert error is None

    def test_below_min(self):
        """Value below minimum should fail."""
        from app import validate_int
        value, error = validate_int(5, "test", min_val=10)
        assert error is not None
        assert "at least" in error

    def test_above_max(self):
        """Value above maximum should fail."""
        from app import validate_int
        value, error = validate_int(100, "test", max_val=50)
        assert error is not None
        assert "at most" in error

    def test_invalid_int(self):
        """Non-integer string should fail."""
        from app import validate_int
        value, error = validate_int("not a number", "test")
        assert error is not None
        assert "must be an integer" in error


class TestModelIdValidation:
    """Tests for validate_model_id function."""

    def test_valid_model_id(self):
        """Valid model ID should pass validation."""
        from app import validate_model_id
        value, error = validate_model_id("deepseek-coder-7b")
        assert value == "deepseek-coder-7b"
        assert error is None

    def test_model_id_with_dots(self):
        """Model ID with dots should pass."""
        from app import validate_model_id
        value, error = validate_model_id("model.v1.0")
        assert value == "model.v1.0"
        assert error is None

    def test_model_id_with_underscores(self):
        """Model ID with underscores should pass."""
        from app import validate_model_id
        value, error = validate_model_id("model_name_v1")
        assert value == "model_name_v1"
        assert error is None

    def test_empty_model_id(self):
        """Empty model ID should fail."""
        from app import validate_model_id
        value, error = validate_model_id("")
        assert error is not None
        assert "required" in error

    def test_none_model_id(self):
        """None model ID should fail."""
        from app import validate_model_id
        value, error = validate_model_id(None)
        assert error is not None
        assert "required" in error

    def test_model_id_invalid_chars(self):
        """Model ID with invalid characters should fail."""
        from app import validate_model_id
        value, error = validate_model_id("model<script>")
        assert error is not None
        assert "invalid characters" in error

    def test_model_id_too_long(self):
        """Model ID exceeding length should fail."""
        from app import validate_model_id
        value, error = validate_model_id("a" * 101)
        assert error is not None
        assert "too long" in error


class TestWorkerIdValidation:
    """Tests for validate_worker_id function."""

    def test_valid_worker_id(self):
        """Valid worker ID should pass validation."""
        from app import validate_worker_id
        value, error = validate_worker_id("worker-gpu-01")
        assert value == "worker-gpu-01"
        assert error is None

    def test_empty_worker_id(self):
        """Empty worker ID should fail."""
        from app import validate_worker_id
        value, error = validate_worker_id("")
        assert error is not None
        assert "required" in error

    def test_worker_id_invalid_chars(self):
        """Worker ID with invalid characters should fail."""
        from app import validate_worker_id
        value, error = validate_worker_id("worker/bad")
        assert error is not None
        assert "invalid characters" in error


class TestUrlValidation:
    """Tests for validate_url function."""

    def test_valid_https_url(self):
        """Valid HTTPS URL should pass."""
        from app import validate_url
        value, error = validate_url("https://example.com/path")
        assert value == "https://example.com/path"
        assert error is None

    def test_valid_http_url(self):
        """Valid HTTP URL should pass."""
        from app import validate_url
        value, error = validate_url("http://localhost:5000/api")
        assert value == "http://localhost:5000/api"
        assert error is None

    def test_empty_url(self):
        """Empty URL should fail."""
        from app import validate_url
        value, error = validate_url("")
        assert error is not None
        assert "required" in error

    def test_invalid_url_scheme(self):
        """URL without valid scheme should fail."""
        from app import validate_url
        value, error = validate_url("ftp://example.com")
        assert error is not None
        assert "valid HTTP" in error

    def test_url_too_long(self):
        """URL exceeding length should fail."""
        from app import validate_url
        value, error = validate_url("https://example.com/" + "a" * 2000)
        assert error is not None
        assert "too long" in error


class TestIpValidation:
    """Tests for IP validation functions."""

    def test_localhost_allowed(self):
        """Localhost should be allowed."""
        from app import is_ip_allowed
        assert is_ip_allowed("127.0.0.1") is True

    def test_docker_internal_allowed(self):
        """Docker internal IPs should be allowed."""
        from app import is_ip_allowed
        assert is_ip_allowed("172.17.0.1") is True

    def test_ipv6_localhost_allowed(self):
        """IPv6 localhost should be allowed."""
        from app import is_ip_allowed
        assert is_ip_allowed("::1") is True
