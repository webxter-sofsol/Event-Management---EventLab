"""
Root conftest.py — pytest-django and Hypothesis configuration.
"""

import django
import pytest
from hypothesis import HealthCheck, settings

# ─── Hypothesis profiles ──────────────────────────────────────────────────────
settings.register_profile(
    "default",
    max_examples=100,
    suppress_health_check=[HealthCheck.too_slow],
)
settings.register_profile(
    "ci",
    max_examples=100,
    suppress_health_check=[HealthCheck.too_slow],
    deadline=None,
)
settings.register_profile(
    "fast",
    max_examples=10,
)
settings.load_profile("default")


@pytest.fixture(scope="session")
def django_db_setup():
    """Use the default test database (in-memory SQLite)."""
    pass
