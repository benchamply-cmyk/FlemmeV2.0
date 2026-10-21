"""V2 HTTP boundary, provider redaction and replay without any live API call."""
import asyncio
from types import SimpleNamespace
from uuid import uuid4

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient

from flemme_manager.main import app
from flemme_manager.memory import service, supabase
from flemme_manager.routes.memory_v2 import get_memory
from flemme_manager.agents import manager
from test_manager import make_assessment


CID, RID = str(uuid4()), str(uuid4())


def assessment():
    return make_assessment(category="quote_comparison", workflow_id="comparer_devis", status="ready")


class FakeMemory:
    async def request(self, method, path, payload):
        assert path == "/rest/v1/rpc/est_admin"
        return True

    def __init__(self):
        self.calls = []
        self.snapshot = {"id": CID, "revision": 1, "mission": {"id": RID, "state": "draft"},
                         "messages": [{"role": "user", "content": "Compare les devis joints."}],
                         "events": [], "pending_request_id": RID}

    async def command(self, *args, **kwargs):
        self.calls.append(args + ((kwargs["payload"],) if "payload" in kwargs else ()))
        return self.snapshot


@pytest.fixture
def memory_client():
    memory = FakeMemory()
    app.dependency_overrides[get_memory] = lambda: memory
    try:
        yield TestClient(app), memory
    finally:
        app.dependency_overrides.clear()


def test_message_persisted_before_analysis_and_assessment_after(memory_client, monkeypatch):
    client, memory = memory_client

    async def analyze(snapshot, text):
        assert memory.calls[0][0] == "user"
        assert snapshot["messages"][0]["content"]
        return assessment()

    monkeypatch.setattr(service, "analyze_history", analyze)
    response = client.post(f"/api/v2/conversations/{CID}/messages", json={
        "request_id": RID, "expected_revision": 0, "request": "Compare les devis joints."})
    assert response.status_code == 201
    assert [c[0] for c in memory.calls] == ["user", "assessment"]
    assert memory.calls[1][-1]["mission_status"] == "ready"


@pytest.mark.parametrize("error,status", [(manager.ManagerConfigurationError,503),
    (manager.ManagerExecutionError,502)])
def test_failed_analysis_retains_user_and_generic_failure(memory_client, monkeypatch, error, status):
    client, memory = memory_client

    async def fail(*args):
        raise error("private provider/key details")

    monkeypatch.setattr(service, "analyze_history", fail)
    response = client.post(f"/api/v2/conversations/{CID}/messages", json={
        "request_id": RID, "expected_revision": 0, "request": "Compare les devis joints."})
    assert response.status_code == status
    assert [c[0] for c in memory.calls] == ["user", "failure"]
    assert "private" not in response.text
    assert "private" not in str(memory.calls)


@pytest.mark.parametrize("pending,status", [(RID,409),(None,201)])
def test_duplicate_does_not_run_model_again(memory_client, monkeypatch, pending, status):
    client, memory = memory_client
    memory.snapshot.update(replayed=True, pending_request_id=pending)

    async def forbidden(*args):
        raise AssertionError("Duplicate invoked model")

    monkeypatch.setattr(service, "analyze_history", forbidden)
    response = client.post(f"/api/v2/conversations/{CID}/messages", json={
        "request_id": RID, "expected_revision": 0, "request": "Compare les devis joints."})
    assert response.status_code == status
    assert len(memory.calls) == 1


def test_resume_and_mission_read_saved_history(memory_client):
    client, memory = memory_client
    assert client.get(f"/api/v2/conversations/{CID}").json() == memory.snapshot
    assert client.get(f"/api/v2/conversations/{CID}/mission").json()["mission"] == memory.snapshot["mission"]


@pytest.mark.parametrize("body", [
    {"request_id": RID, "expected_revision": -1, "request": "ok"},
    {"request_id": RID, "expected_revision": 0, "request": " "},
    {"request_id": RID, "expected_revision": 0, "request": "x"*5001},
    {"request_id": RID, "expected_revision": 0, "request": "ok", "owner_id": CID},
])
def test_invalid_request_never_reaches_storage(memory_client, body):
    client, memory = memory_client
    assert client.post(f"/api/v2/conversations/{CID}/messages", json=body).status_code == 422
    assert memory.calls == []


def test_page_bounded_and_extra_payload_rejected(memory_client):
    client, memory = memory_client
    assert client.get("/api/v2/conversations?limit=101").status_code == 422
    assert client.post("/api/v2/conversations", json={"conversation_id": CID, "owner_id": RID}).status_code == 422
    assert memory.calls == []


@pytest.mark.parametrize("status", [404,409,422,503])
def test_storage_error_redacted(memory_client, status):
    client, memory = memory_client

    async def fail(*args):
        raise supabase.StorageError(status)

    memory.command = fail
    response = client.get(f"/api/v2/conversations/{CID}")
    assert response.status_code == status
    assert "traceback" not in response.text.lower()


def configure(monkeypatch):
    monkeypatch.setenv("FLEMME_V2_ENABLED", "true")
    monkeypatch.setenv("FLEMME_V2_SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("FLEMME_V2_SUPABASE_PUBLISHABLE_KEY", "public-test-key")


def test_disabled_by_default(monkeypatch):
    monkeypatch.delenv("FLEMME_V2_ENABLED", raising=False)
    assert TestClient(app).get("/api/v2/conversations").status_code == 503


@pytest.mark.parametrize("token", [None,"Basic hello","Bearer ","Bearer bad token"])
def test_missing_or_malformed_session(monkeypatch, token):
    configure(monkeypatch)
    response = TestClient(app).get("/api/v2/conversations", headers={"Authorization":token} if token else {})
    assert response.status_code == 401


@pytest.mark.parametrize("user,status", [({"id":RID},401),({"id":RID,"email_confirmed_at":"2026-10-14"},200)])
def test_session_verified_before_rpc(monkeypatch, user, status):
    configure(monkeypatch)
    calls=[]

    async def request(self, method, path, payload=None):
        calls.append((path, self.headers))
        return user if path=="/auth/v1/user" else []

    monkeypatch.setattr(supabase.SupabaseMemory,"request",request)
    response=TestClient(app).get("/api/v2/conversations",headers={"Authorization":"Bearer user-session"})
    assert response.status_code==status
    assert calls[0][0]=="/auth/v1/user"
    assert calls[0][1]["Authorization"]=="Bearer user-session"
    assert len(calls)==(2 if status==200 else 1)


@pytest.mark.parametrize("code,status", [("PT404",404),("PT409",409),("PT422",422),("42501",503)])
def test_rpc_provider_errors_mapped_without_details(monkeypatch,code,status):
    async def fake_request(self,*args,**kwargs):
        return httpx.Response(400,json={"code":code,"message":"secret database diagnostics"})

    monkeypatch.setattr(httpx.AsyncClient,"request",fake_request)
    memory=supabase.SupabaseMemory("https://example.supabase.co","public","token")
    with pytest.raises(supabase.StorageError) as raised:
        asyncio.run(memory.command("snapshot",CID))
    assert raised.value.status==status
    assert "secret" not in str(raised.value)


def test_full_dialogue_replayed_in_order_and_tracing_disabled(monkeypatch):
    monkeypatch.setattr(manager.settings,"openai_api_key","test-key")
    messages=[{"role":"user","content":"Premier besoin"},
              {"role":"assistant","content":assessment().model_dump_json()},
              {"role":"user","content":"Précision complémentaire"}]

    async def run(agent, saved_messages, *, max_turns, run_config):
        assert saved_messages==messages
        assert max_turns==1 and run_config.tracing_disabled
        return SimpleNamespace(final_output=assessment())

    monkeypatch.setattr(service.Runner,"run",run)
    result=asyncio.run(service.analyze_history({"messages":messages},"Précision complémentaire"))
    assert result==assessment()


def test_context_limit_preserves_history_and_fails_without_model(monkeypatch):
    messages=[{"role":"user","content":"Une précision"}]*41
    with pytest.raises(supabase.StorageError) as error:
        asyncio.run(service.analyze_history({"messages":messages},"Une précision"))
    assert error.value.status==409
    assert len(messages)==41


def test_invalid_assessment_records_failure_instead_of_leaving_pending(memory_client, monkeypatch):
    client, memory = memory_client
    invalid = assessment().model_copy(update={"service_category":"service_provider"})

    async def analyze(*args):
        return invalid

    monkeypatch.setattr(service, "analyze_history", analyze)
    response = client.post(f"/api/v2/conversations/{CID}/messages", json={
        "request_id":RID,"expected_revision":0,"request":"Compare les devis joints."})
    assert response.status_code==502
    assert [c[0] for c in memory.calls]==["user","failure"]


def test_validated_session_forwards_token_to_rpc_without_service_role(monkeypatch):
    configure(monkeypatch)
    seen=[]

    async def fake_request(self, method, url, *, headers, json):
        seen.append((method,url,headers,json))
        if url.endswith('/auth/v1/user'):
            return httpx.Response(200,json={"id":RID,"email_confirmed_at":"2026-10-14"})
        return httpx.Response(200,json=[])

    monkeypatch.setattr(httpx.AsyncClient,"request",fake_request)
    response=TestClient(app).get("/api/v2/conversations",headers={"Authorization":"Bearer user-token"})
    assert response.status_code==200
    assert seen[1][1].endswith('/rest/v1/rpc/fm_v2_command')
    assert all(c[2]['Authorization']=='Bearer user-token' for c in seen)
    assert seen[1][3]['p_operation']=='list'


@pytest.mark.parametrize("error",[httpx.ConnectError('secret'),httpx.ReadTimeout('secret')])
def test_transport_failure_is_redacted(monkeypatch,error):
    async def fail(*args,**kwargs):
        raise error
    monkeypatch.setattr(httpx.AsyncClient,"request",fail)
    memory=supabase.SupabaseMemory('https://example.supabase.co','public','token')
    with pytest.raises(supabase.StorageError) as raised:
        asyncio.run(memory.command('snapshot',CID))
    assert raised.value.status==503
    assert 'secret' not in str(raised.value)


def test_legacy_analysis_requires_session_when_v2_enabled(monkeypatch):
    configure(monkeypatch)
    response=TestClient(app).post('/api/manager/analyze',json={'request':'Compare ces devis.'})
    assert response.status_code==401
