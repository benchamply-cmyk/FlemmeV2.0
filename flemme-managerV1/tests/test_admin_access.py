from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from flemme_manager.main import app
from flemme_manager.memory.supabase import get_memory, StorageError, require_admin
from fastapi import HTTPException
import asyncio


class Memory:
    def __init__(self, role): self.role = role
    async def request(self, method, path, payload):
        assert path == '/rest/v1/rpc/est_admin'
        if isinstance(self.role, Exception): raise self.role
        return self.role
    async def command(self, *a, **kw): return []
    async def delivery_command(self, *a, **kw): return []


@pytest.mark.parametrize('role', [False, None, 'true', 1, {'admin': True}])
def test_only_literal_admin_is_authorized(role):
    with pytest.raises(HTTPException) as error:
        asyncio.run(require_admin(Memory(role)))
    assert error.value.status_code == 403


def test_role_unavailable_fails_closed():
    with pytest.raises(HTTPException) as error:
        asyncio.run(require_admin(Memory(StorageError())))
    assert error.value.status_code == 503


@pytest.mark.parametrize('admin', [False, True])
def test_access_and_read_history(admin, monkeypatch):
    monkeypatch.setenv('FLEMME_V3_ENABLED', 'true')
    app.dependency_overrides[get_memory] = lambda: Memory(admin)
    try:
        client = TestClient(app)
        assert client.get('/api/v2/access').json() == {'can_run_agents': admin}
        assert client.get('/api/v2/conversations').status_code == 200
        assert client.get('/api/v3/conversations/'+str(uuid4())+'/deliveries').status_code == 200
    finally: app.dependency_overrides.clear()


def test_customer_can_write_to_manager(monkeypatch):
    calls = []
    async def turn(memory, cid, rid, text, revision):
        calls.append(text); return {'revision': revision + 2}
    monkeypatch.setattr('flemme_manager.routes.memory_v2.submit_turn', turn)
    app.dependency_overrides[get_memory] = lambda: Memory(False)
    try:
        client, cid = TestClient(app), str(uuid4())
        assert client.post('/api/v2/conversations', json={'conversation_id': cid}).status_code == 201
        response = client.post('/api/v2/conversations/'+cid+'/messages',
                               json={'request_id': str(uuid4()), 'expected_revision': 0, 'request': 'Compare mes devis'})
        assert response.status_code == 201 and calls == ['Compare mes devis']
    finally: app.dependency_overrides.clear()


@pytest.mark.parametrize('suffix', ['/mission/events','/messages/recover'])
def test_customer_cannot_mutate_v2(suffix):
    app.dependency_overrides[get_memory] = lambda: Memory(False)
    try:
        response=TestClient(app).post('/api/v2/conversations'+('/'+str(uuid4())+suffix if suffix else ''),json={})
        assert response.status_code == 403
    finally: app.dependency_overrides.clear()


@pytest.mark.parametrize('version,suffix', [('v3','deliveries'),('v3','deliveries/recover'),('v4','acquisitions')])
def test_customer_cannot_launch_specialists(version,suffix,monkeypatch):
    monkeypatch.setenv('FLEMME_V3_ENABLED','true')
    monkeypatch.setenv('FLEMME_ACQUISITION_ENABLED','true')
    app.dependency_overrides[get_memory] = lambda: Memory(False)
    try:
        assert TestClient(app).post('/api/'+version+'/conversations/'+str(uuid4())+'/'+suffix,json={}).status_code == 403
    finally: app.dependency_overrides.clear()


def test_legacy_closed_even_when_v2_disabled(monkeypatch):
    monkeypatch.delenv('FLEMME_V2_ENABLED',raising=False)
    assert TestClient(app).post('/api/manager/analyze',json={'request':'Cherche un produit'}).status_code == 503
