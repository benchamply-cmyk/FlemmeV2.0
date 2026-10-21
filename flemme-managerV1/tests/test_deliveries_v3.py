import asyncio
from copy import deepcopy
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from flemme_manager.main import app
from flemme_manager.routes.deliveries_v3 import get_memory
from flemme_manager.services import delivery_v3
from flemme_manager.delivery_schemas import DeliveryRequest, DeliveryQualityError
from flemme_manager.memory.supabase import StorageError
from test_specialists import source
from test_manager import make_assessment

CID,RID=str(uuid4()),str(uuid4())


def qualification():
    return make_assessment(category='quote_comparison',workflow_id='comparer_devis',status='ready').model_dump(mode='json')


class Memory:
    async def request(self, method, path, payload):
        assert path == "/rest/v1/rpc/est_admin"
        return True

    def __init__(self):
        self.calls=[]
        self.snapshot={'pending_request_id':None,'mission':{'state':'in_progress'},'messages':[{'assessment':qualification()}]}
        self.reservation={'snapshot':self.snapshot,'replayed':False}
    async def delivery_command(self,*args,**kwargs):
        self.calls.append((args,kwargs))
        return self.reservation if args[0]=='reserve' else {'saved':True}


@pytest.fixture
def setup(monkeypatch):
    from flemme_manager.services import agent_plans
    async def approved(*args): return {}
    monkeypatch.setattr(agent_plans, 'require_approval', approved)
    monkeypatch.setenv('FLEMME_V3_ENABLED','true')
    memory=Memory();app.dependency_overrides[get_memory]=lambda:memory
    try:yield TestClient(app),memory
    finally:app.dependency_overrides.clear()


def body(**extra):
    return {'request_id':RID,'expected_revision':2,'sources':[source('A'),source('B',price='980')],**extra}


def test_four_agents_execute_and_persist_exact_delivery(setup):
    client,memory=setup
    r=client.post(f'/api/v3/conversations/{CID}/deliveries',json=body())
    assert r.status_code==201
    assert [c[0][0] for c in memory.calls]==['reserve','finish']
    result=memory.calls[1][1]['payload']['result']
    assert result['agents']==['Search','Compare','Writer','Quality']
    assert result['comparison']['price_groups'][0]['spread']=='220.00'
    assert result['quality']['passed']


def test_replay_never_executes_agents_again(setup,monkeypatch):
    client,memory=setup;memory.reservation.update(replayed=True,output={'stored':'result'})
    monkeypatch.setattr(delivery_v3,'run_pipeline',lambda *a:pytest.fail('Duplicate execution'))
    assert client.post(f'/api/v3/conversations/{CID}/deliveries',json=body()).status_code==201
    assert len(memory.calls)==1


def test_pending_replay_is_conflict(setup):
    client,memory=setup;memory.reservation['replayed']=True
    assert client.post(f'/api/v3/conversations/{CID}/deliveries',json=body()).status_code==409
    assert len(memory.calls)==1


@pytest.mark.parametrize('state',['blocked','completed','cancelled','waiting_information','human_required','out_of_catalog'])
def test_invalid_mission_never_executes_agents(setup,monkeypatch,state):
    client,memory=setup;memory.snapshot['mission']['state']=state
    monkeypatch.setattr(delivery_v3,'run_pipeline',lambda *a:pytest.fail('Blocked mission executed'))
    assert client.post(f'/api/v3/conversations/{CID}/deliveries',json=body()).status_code==409


def test_missing_sources_for_quote_workflow_records_failure(setup):
    client,memory=setup
    assert client.post(f'/api/v3/conversations/{CID}/deliveries',json=body(sources=[source()])).status_code==422
    assert memory.calls[-1][1]['payload']['failure']=='insufficient_evidence'


def test_quality_failure_is_generic_and_preserved(setup,monkeypatch):
    client,memory=setup
    def fail(*a):raise DeliveryQualityError('private details')
    monkeypatch.setattr(delivery_v3,'run_pipeline',fail)
    r=client.post(f'/api/v3/conversations/{CID}/deliveries',json=body())
    assert r.status_code==502 and 'private' not in r.text
    assert memory.calls[-1][1]['payload']['failure']=='quality_or_qualification'


def test_user_cannot_override_workflow_or_owner(setup):
    client,memory=setup
    assert client.post(f'/api/v3/conversations/{CID}/deliveries',json=body(workflow_id='organiser_voyage')).status_code==422
    assert client.post(f'/api/v3/conversations/{CID}/deliveries',json=body(owner_id=RID)).status_code==422
    assert not memory.calls


def test_v3_disabled_by_default(monkeypatch):
    monkeypatch.delenv('FLEMME_V3_ENABLED',raising=False)
    assert TestClient(app).get(f'/api/v3/conversations/{CID}/deliveries').status_code==503


def test_v3_requires_v2_authentication(monkeypatch):
    monkeypatch.setenv('FLEMME_V3_ENABLED','true');monkeypatch.setenv('FLEMME_V2_ENABLED','true')
    monkeypatch.setenv('FLEMME_V2_SUPABASE_URL','https://example.supabase.co')
    monkeypatch.setenv('FLEMME_V2_SUPABASE_PUBLISHABLE_KEY','public')
    assert TestClient(app).get(f'/api/v3/conversations/{CID}/deliveries').status_code==401


def test_list_and_recovery_use_user_bound_store(setup):
    client,memory=setup
    assert client.get(f'/api/v3/conversations/{CID}/deliveries').status_code==200
    assert client.post(f'/api/v3/conversations/{CID}/deliveries/recover',json={
      'request_id':RID,'expected_revision':4,'note':'Interruption vérifiée'}).status_code==200
    assert [c[0][0] for c in memory.calls]==['list','recover']


def test_tampered_report_fails_independent_quality_check_and_retains_draft(setup,monkeypatch):
    client,memory=setup
    original=delivery_v3.run_pipeline
    def tamper(*args):
        result=original(*args)
        return result.model_copy(update={'markdown':result.markdown+"J'ai réservé."})
    monkeypatch.setattr(delivery_v3,'run_pipeline',tamper)
    response=client.post(f'/api/v3/conversations/{CID}/deliveries',json=body())
    assert response.status_code==502
    payload=memory.calls[-1][1]['payload']
    assert payload['failure']=='quality_or_qualification'
    assert payload['draft']['markdown'].endswith("J'ai réservé.")


def test_invalid_saved_qualification_does_not_reach_pipeline(setup,monkeypatch):
    client,memory=setup
    memory.snapshot['messages'][0]['assessment']['service_category']='service_provider'
    monkeypatch.setattr(delivery_v3,'run_pipeline',lambda *a:pytest.fail('Invalid qualification executed'))
    assert client.post(f'/api/v3/conversations/{CID}/deliveries',json=body()).status_code==409


def test_pending_user_analysis_prevents_delivery(setup,monkeypatch):
    client,memory=setup;memory.snapshot['pending_request_id']=RID
    monkeypatch.setattr(delivery_v3,'run_pipeline',lambda *a:pytest.fail('Pending user turn executed'))
    assert client.post(f'/api/v3/conversations/{CID}/deliveries',json=body()).status_code==409
