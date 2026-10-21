"""Tests are offline, including SDK tracing and credential discovery."""

import os
import socket

import pytest

os.environ["PYTHON_DOTENV_DISABLED"] = "1"
os.environ["OPENAI_AGENTS_DISABLE_TRACING"] = "1"
os.environ["OPENAI_API_KEY"] = ""


@pytest.fixture(autouse=True)
def forbid_network(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError("Network access forbidden in offline tests")

    monkeypatch.setattr(socket.socket, "connect", blocked)
    monkeypatch.setattr(socket.socket, "connect_ex", blocked)
    monkeypatch.setattr(socket, "create_connection", blocked)


@pytest.fixture(autouse=True)
def authenticated_analysis_unit_tests(request):
    # Policy/model unit tests isolate authorization; dedicated access tests do not.
    modules = {"test_f04_policy", "test_manager", "test_qualification_policy", "test_v11_outputs"}
    if request.module.__name__ not in modules:
        yield
        return
    from flemme_manager.main import app
    from flemme_manager.memory.supabase import protect_legacy_analysis
    app.dependency_overrides[protect_legacy_analysis] = lambda: None
    try:
        yield
    finally:
        app.dependency_overrides.pop(protect_legacy_analysis, None)
