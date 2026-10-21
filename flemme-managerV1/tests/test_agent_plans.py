"""The real HTTP approval boundary; offline tools must never run before approval."""
from copy import deepcopy
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from flemme_manager.main import app
from flemme_manager.memory.supabase import get_memory, StorageError
from flemme_manager.routes import acquisition, deliveries_v3
from flemme_manager.services.agent_plans import fingerprint
from flemme_manager.services.acquisition import Acquire
from test_manager import make_assessment

CID=str(uuid4())


class Memory:
    def __init__(self):
        assessment=make_assessment(category='product_research',workflow_id='rechercher_produit',status='ready').model_dump(mode='json')
        self.snapshot={'id':CID,'revision':2,'pending_request_id':None,'mission':{'state':'qualified'},
                       'events':[],'messages':[{'assessment':assessment}]}
        self.role=True
    async def request(self,method,path,payload):
        assert path=='/rest/v1/rpc/est_admin'
        return self.role
    async def command(self,op,cid,rid=None,rev=None,payload=None):
        assert cid==CID
        if op=='snapshot':return deepcopy(self.snapshot)
        assert op=='event'
        if rev!=self.snapshot['revision']:raise StorageError(409)
        self.snapshot['revision']+=1
        self.snapshot['events'].append({'request_id':rid,'revision':self.snapshot['revision'],'payload':payload})
        return deepcopy(self.snapshot)


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.setenv('FLEMME_V3_ENABLED','true');monkeypatch.setenv('FLEMME_ACQUISITION_ENABLED','true')
    memory=Memory();calls=[]
    async def produce(*args):calls.append(args);return {'stored':True}
    monkeypatch.setattr(acquisition,'produce',produce)
    monkeypatch.setattr(deliveries_v3,'produce_delivery',produce)
    app.dependency_overrides[get_memory]=lambda:memory
    try:yield TestClient(app),memory,calls
    finally:app.dependency_overrides.clear()


def request():
    return {'request_id':str(uuid4()),'expected_revision':2,'mode':'web','query':'Lave-linge silencieux moins de 600 EUR','documents':[],
            'constraints':{'max_price':'600','currency':'EUR','price_basis':'per_month','tax_basis':'included'}}


def propose(client,body):
    return client.post(f'/api/v2/conversations/{CID}/agent-plans',json={'plan_id':str(uuid4()),'kind':'acquisition','request':body})


def approve(client,plan,revision):
    return client.post(f'/api/v2/conversations/{CID}/agent-plans/{plan}/approve',json={'request_id':str(uuid4()),'expected_revision':revision,'approved':True})


def test_prepare_approve_then_explicit_execution(setup):
    client,memory,calls=setup;body=request()
    response=propose(client,body);assert response.status_code==201
    plan=response.json()['plan'];assert [s['agent'] for s in plan['steps']]==['Search','Compare','Quality']
    assert plan['steps'][0]['parameters']['query']==body['query'];assert calls==[]
    assert client.post(f'/api/v4/conversations/{CID}/acquisitions',json=body).status_code==409
    response=approve(client,plan['id'],3);assert response.status_code==200;assert calls==[]
    body.update(approval_id=response.json()['approval_id'],expected_revision=4)
    assert client.post(f'/api/v4/conversations/{CID}/acquisitions',json=body).status_code==201
    assert len(calls)==1
    assert memory.snapshot['events'][1]['payload']['agent_plan_approval']['plan_id']==plan['id']


@pytest.mark.parametrize('change',['query','budget','request_id','revision','mission','forged'])
def test_modified_or_unapproved_input_never_executes(setup,change):
    client,memory,calls=setup;body=request();plan=propose(client,body).json()['plan'];approved=approve(client,plan['id'],3).json()
    body.update(approval_id=approved['approval_id'],expected_revision=4)
    if change=='query':body['query']='Une autre recherche'
    if change=='budget':body['constraints']['max_price']='999'
    if change=='request_id':body['request_id']=str(uuid4())
    if change=='revision':body['expected_revision']=3
    if change=='mission':memory.snapshot['revision']+=1
    if change=='forged':body['approval_id']=str(uuid4())
    assert client.post(f'/api/v4/conversations/{CID}/acquisitions',json=body).status_code==409
    assert calls==[]


def test_new_plan_invalidates_old_approval_and_can_be_edited(setup):
    client,memory,calls=setup;body=request();plan=propose(client,body).json()['plan'];approved=approve(client,plan['id'],3).json()
    old={**body,'approval_id':approved['approval_id'],'expected_revision':4}
    body['query']='Lave-linge avec une largeur de 60 cm';body['expected_revision']=4
    new=propose(client,body);assert new.status_code==201
    assert new.json()['plan']['steps'][0]['parameters']['query']==body['query']
    assert client.post(f'/api/v4/conversations/{CID}/acquisitions',json=old).status_code==409
    assert calls==[]


def test_stale_plan_cannot_be_approved(setup):
    client,memory,calls=setup;body=request();plan=propose(client,body).json()['plan'];memory.snapshot['revision']+=1
    assert approve(client,plan['id'],4).status_code==409;assert calls==[]


def test_customers_cannot_prepare_or_approve(setup):
    client,memory,calls=setup;memory.role=False
    assert propose(client,request()).status_code==403
    assert approve(client,str(uuid4()),2).status_code==403;assert calls==[]


def test_v3_cannot_bypass_approval(setup):
    from test_specialists import source
    client,_,calls=setup
    body={'request_id':str(uuid4()),'expected_revision':2,'sources':[source('A'),source('B')]}
    assert client.post(f'/api/v3/conversations/{CID}/deliveries',json=body).status_code==409;assert calls==[]


def test_document_fingerprint_binds_bytes_not_just_name():
    from test_acquisition import doc
    body={**request(),'mode':'documents','documents':[doc(),doc()]}
    first=fingerprint('acquisition',Acquire.model_validate(body))
    body['documents'][0]=doc(text='Un devis modifié : 980 EUR TTC')
    assert fingerprint('acquisition',Acquire.model_validate(body))!=first


def test_prepare_and_approval_replay_do_not_duplicate_history(setup):
    client,memory,calls=setup
    body={'plan_id':str(uuid4()),'kind':'acquisition','request':request()}
    path=f'/api/v2/conversations/{CID}/agent-plans'
    first=client.post(path,json=body);assert first.status_code==201
    assert client.post(path,json=body).status_code==201
    assert len(memory.snapshot['events'])==1
    approval={'request_id':str(uuid4()),'expected_revision':3,'approved':True}
    path+=f'/{body["plan_id"]}/approve'
    assert client.post(path,json=approval).status_code==200
    assert client.post(path,json=approval).status_code==200
    assert len(memory.snapshot['events'])==2;assert calls==[]


def test_explicit_approval_required(setup):
    client,_,calls=setup;plan=propose(client,request()).json()['plan']
    for value in [False,'true',1]:
        assert client.post(f'/api/v2/conversations/{CID}/agent-plans/{plan["id"]}/approve',
            json={'request_id':str(uuid4()),'expected_revision':3,'approved':value}).status_code==422
    assert calls==[]


def test_document_plan_assigns_extraction_and_never_searches(setup):
    from test_acquisition import doc
    client,memory,calls=setup
    memory.snapshot['messages'][0]['assessment']=make_assessment(category='quote_comparison',workflow_id='comparer_devis',status='ready').model_dump(mode='json')
    body={**request(),'mode':'documents','documents':[doc(),doc()]}
    response=propose(client,body);assert response.status_code==201
    assert [s['agent'] for s in response.json()['plan']['steps']]==['Document','Compare','Quality']
    assert calls==[]
