import asyncio
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from flemme_manager.main import app
from flemme_manager.settings import settings
from flemme_manager.qualification_models import QualificationAssessment, MissionFacts
from flemme_manager.schemas import validate_manager_assessment
from flemme_manager.services.conversation_store import Store
from flemme_manager.agents import qualification
from flemme_manager.agents.manager import ManagerExecutionError
from flemme_manager.workflows.qualification import qualification_summary

SVC = {"X-Flemme-Service-Key":"svc"}
OP = {"X-Flemme-Operator-Key":"operator"}
EX = {"X-Flemme-Executor-Key":"executor"}

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "data" / "qual.sqlite3"))
    monkeypatch.setattr(settings, "service_key", "svc")
    monkeypatch.setattr(settings, "operator_key", "operator")
    monkeypatch.setattr(settings, "executor_key", "executor")
    monkeypatch.setattr(settings, "daily_model_limit", 300)
    with TestClient(app) as c:
        yield c


def assessment(ready=False, human=False, category="service_provider", workflow="trouver_prestataire"):
    facts = MissionFacts(scope="Nettoyer la terrasse", location="Lyon" if ready else None,
                         budget="200 EUR" if ready else None, deadline="Samedi" if ready else None)
    return QualificationAssessment(
        service_category=category, expected_result={"description":"Une terrasse nettoyée samedi."},
        selected_workflow={"workflow_id":workflow, "reason":"Besoin de nettoyage."},
        missing_information=[] if ready or human else [{"name":"location", "reason":"Zone à préciser."}],
        qualification_questions=[] if ready or human else [{"question":"Dans quelle ville ?", "why_needed":"Pour délimiter la zone.", "priority":1}],
        mission_status="human_intervention_required" if human else "ready" if ready else "needs_information",
        human_intervention_required=human,user_response={"message":"Voici les précisions nécessaires."},facts=facts)

@pytest.fixture
def model(monkeypatch):
    calls=[]
    async def fake(history, previous):
        calls.append((history,previous))
        return assessment(ready=any("Lyon" in x["content"] for x in history if x["role"] == "user"))
    monkeypatch.setattr(qualification, "analyze_conversation", fake)
    return calls


def start(client):
    r=client.post("/api/qualification/conversations",headers=SVC,json={"task":"Nettoyer ma terrasse", "consent":True})
    assert r.status_code == 201, r.text
    data=r.json();headers={**SVC,"Authorization":"Bearer "+data["token"]}
    return data,headers

def message(client,data,headers,text,request_id=None):
    return client.post(f"/api/qualification/conversations/{data['id']}/messages",headers=headers,
                       json={"message":text,"version":data["version"],"request_id":request_id or str(uuid4())})

def qualify(client,model):
    data,headers=start(client)
    first=message(client,data,headers,"Quelles précisions ?").json()
    assert not first["summary"]["ready"]
    r=message(client,first,headers,"À Lyon samedi, budget de 200 EUR")
    assert r.status_code == 200,r.text
    return r.json(),headers

def confirm(client,data,headers,contact="toi@example.fr"):
    return client.post(f"/api/qualification/conversations/{data['id']}/confirm",headers=headers,
                       json={"version":data["version"],"consent":True,"contact":contact,"reference":"FL-ABCDE"})

def test_full_workflow_progressive_approval_routing_completion(client,model):
    data,headers=qualify(client,model)
    assert data["summary"]["ready"]
    assert data["summary"]["workflow"] == "trouver_prestataire"
    assert len(model[1][0]) == 4 # prior user, reply and assistant question preserved
    assert model[1][1]["scope"] == "Nettoyer la terrasse"
    assert client.post("/api/executor/claim/search",headers=EX).json() is None
    response=confirm(client,data,headers)
    assert response.status_code == 200,response.text
    assert response.json()["state"] == "pending_human"
    assert confirm(client,data,headers).status_code == 200 # retry is harmless
    assert confirm(client,data,headers,"different@example.fr").status_code == 409
    assert message(client,response.json(),headers,"Change le budget").status_code == 409
    path=f"/api/operator/missions/{data['id']}/decision"
    assert client.post(path,headers=SVC,json={"approve":True,"reason":"Vérifié"}).status_code == 401
    assert client.post(path,headers=OP,json={"approve":True,"reason":"Résumé vérifié"}).status_code == 200
    assert client.post(path,headers=OP,json={"approve":True,"reason":"Résumé vérifié"}).status_code == 200
    assert client.post("/api/executor/claim/writer",headers=EX).json() is None
    for name in ("search","quality","writer"):
        job=client.post("/api/executor/claim/"+name,headers=EX).json()
        assert job["mission"]["permissions"] == {"external_actions":False}
        assert "contact" not in job["mission"]
        assert client.post("/api/executor/claim/"+name,headers=EX).json() is None
        result=client.post(f"/api/executor/jobs/{job['id']}/complete",headers=EX,json={"lease_token":job["lease_token"],"result":"Préparation fournie à relire."})
        assert result.status_code == 200,result.text
    assert client.get(f"/api/qualification/conversations/{data['id']}",headers=headers).json()["state"] == "completed"
    with Store().db() as db:
        assert db.execute("SELECT COUNT(*) FROM jobs").fetchone()[0] == 1
        assert db.execute("SELECT COUNT(*) FROM audit").fetchone()[0] == 5

@pytest.mark.parametrize("payload", [{"task":"Test"},{"task":"Test","consent":False},{"task":" " ,"consent":True},{"task":"a"*1501,"consent":True},{"task":"Test","consent":True,"status":"queued"}])
def test_input_and_consent_validation(client,payload):
    assert client.post("/api/qualification/conversations",headers=SVC,json=payload).status_code == 422


def test_fail_closed_and_ownership(client,monkeypatch):
    assert client.post("/api/qualification/conversations",json={"task":"Test","consent":True}).status_code == 401
    data,headers=start(client)
    other={**SVC,"Authorization":"Bearer wrong"}
    assert client.get(f"/api/qualification/conversations/{data['id']}",headers=other).status_code == 404
    monkeypatch.setattr(settings,"service_key",None)
    assert client.get(f"/api/qualification/conversations/{data['id']}",headers=headers).status_code == 503


def test_idempotency_and_stale_version(client,model):
    data,headers=start(client);request_id=str(uuid4())
    first=message(client,data,headers,"Quelles précisions ?",request_id)
    second=message(client,data,headers,"Quelles précisions ?",request_id)
    assert first.json() == second.json()
    assert len(model) == 1
    assert message(client,data,headers,"Autre contenu",request_id).status_code == 409
    assert message(client,data,headers,"Ancienne version").status_code == 409
    assert confirm(client,first.json(),headers).status_code == 409


def test_busy_lease_and_fencing(client,model):
    data,headers=start(client);s=Store()
    first,ok=s.reserve(data["id"],headers["Authorization"][7:],0,"first-request","Bonjour")
    assert ok
    assert message(client,{**data,"version":first["version"]},headers,"Concurrence").status_code == 409
    with s.db() as db:
        db.execute("UPDATE conversations SET lease=0 WHERE id=?",(data["id"],))
    second,ok=s.reserve(data["id"],headers["Authorization"][7:],first["version"],"second-request","Bonjour")
    assert ok
    with pytest.raises(Exception) as err:
        s.save_turn(data["id"],headers["Authorization"][7:],first["version"],first["data"])
    assert err.value.status_code == 409
    s.release(data["id"],first["version"])
    assert s.get(data["id"],headers["Authorization"][7:])["lease"] > time.time()


def test_provider_failure_releases_lease_and_hides_details(client,monkeypatch,model):
    original=qualification.analyze_conversation
    async def fail(*args): raise ManagerExecutionError("secret diagnostics")
    monkeypatch.setattr(qualification,"analyze_conversation",fail)
    data,headers=start(client)
    r=message(client,data,headers,"Quelles précisions ?")
    assert r.status_code == 502 and "secret" not in r.text
    fresh=client.get(f"/api/qualification/conversations/{data['id']}",headers=headers).json()
    assert fresh["history"] == data["history"]
    monkeypatch.setattr(qualification,"analyze_conversation",original)
    assert message(client,fresh,headers,"Réessaie").status_code == 200


def test_human_required_never_auto_routes(client,monkeypatch):
    async def human(*args): return assessment(ready=True,human=True)
    monkeypatch.setattr(qualification,"analyze_conversation",human)
    data,headers=start(client)
    data=message(client,data,headers,"Achète maintenant").json()
    assert confirm(client,data,headers).status_code == 200
    assert client.post(f"/api/operator/missions/{data['id']}/decision",headers=OP,json={"approve":True,"reason":"Vérifié"}).status_code == 409
    assert client.post("/api/executor/claim/search",headers=EX).json() is None


def test_expiry_deletion_and_no_store(client,model):
    data,headers=start(client)
    r=client.get(f"/api/qualification/conversations/{data['id']}",headers=headers)
    assert r.headers["cache-control"] == "no-store"
    assert client.delete(f"/api/qualification/conversations/{data['id']}",headers=headers).status_code == 204
    assert client.get(f"/api/qualification/conversations/{data['id']}",headers=headers).status_code == 404
    data,headers=start(client)
    with Store().db() as db:
        db.execute("UPDATE conversations SET expires=0 WHERE id=?",(data["id"],))
    assert client.get(f"/api/qualification/conversations/{data['id']}",headers=headers).status_code == 404
    assert os.stat(settings.database_path).st_mode & 0o777 == 0o600


def test_global_budget_limits_model_calls(client,model,monkeypatch):
    data,headers=start(client)
    monkeypatch.setattr(settings,"daily_model_limit",1)
    assert message(client,data,headers,"Quelles précisions ?").status_code == 429
    assert model == []

@pytest.mark.parametrize("workflow,required",[("comparer_devis",["scope","documents_summary","success_criteria"]),("trouver_prestataire",["scope","location","budget","deadline"]),("rechercher_produit",["scope","budget","success_criteria"]),("organiser_voyage",["scope","location","budget","deadline","constraints"])])
def test_required_facts_cannot_be_bypassed_by_ready_model(workflow,required):
    a=assessment(ready=True)
    a.selected_workflow.workflow_id=workflow
    a.facts=MissionFacts()
    summary=qualification_summary(a)
    assert not summary["ready"]
    assert summary["missing_fields"] == required
    assert len(summary["questions"]) <= 2


def test_worker_reclaim_rejects_old_result(client,model):
    data,headers=qualify(client,model);confirm(client,data,headers)
    client.post(f"/api/operator/missions/{data['id']}/decision",headers=OP,json={"approve":True,"reason":"Vérifié"})
    first=client.post("/api/executor/claim/search",headers=EX).json()
    with Store().db() as db: db.execute("UPDATE jobs SET lease=0")
    second=client.post("/api/executor/claim/search",headers=EX).json()
    assert first["id"] == second["id"] and first["lease_token"] != second["lease_token"]
    r=client.post(f"/api/executor/jobs/{first['id']}/complete",headers=EX,json={"lease_token":first["lease_token"],"result":"Ancien résultat"})
    assert r.status_code == 409


def test_sdk_qualification_privacy_and_structured_contract(monkeypatch):
    from types import SimpleNamespace
    monkeypatch.setattr(settings,"openai_api_key","test")
    a=assessment(ready=True)
    async def run(*args,**kwargs):
        assert kwargs["run_config"].tracing_disabled
        assert kwargs["max_turns"] == 3
        assert args[0].model_settings.store is False
        assert args[0].tools == []
        assert args[0].output_type is QualificationAssessment
        return SimpleNamespace(final_output=a)
    monkeypatch.setattr(qualification.Runner,"run",run)
    assert asyncio.run(qualification.analyze_conversation([{"role":"user","content":"Test"}],{})) == a


def test_real_executor_adapter_without_network(monkeypatch):
    from types import SimpleNamespace
    from flemme_manager.agents import executors
    async def run(agent, mission, **kwargs):
        assert agent.tools == [] and agent.model_settings.store is False
        assert kwargs["run_config"].tracing_disabled
        return SimpleNamespace(final_output="Préparation à relire.")
    monkeypatch.setattr(executors.Runner,"run",run)
    assert asyncio.run(executors.prepare("writer",{"permissions":{"external_actions":False}})) == "Préparation à relire."
