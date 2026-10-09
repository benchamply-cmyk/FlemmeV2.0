"""Operator and executor surfaces are never exposed by the Netlify customer proxy."""
from fastapi import APIRouter, Depends
from flemme_manager.qualification_models import HumanDecision, CompleteJob
from flemme_manager.security import operator_auth, executor_auth
from flemme_manager.services import mission_service

operator_router = APIRouter(prefix="/api/operator", dependencies=[Depends(operator_auth)], tags=["operator"])
executor_router = APIRouter(prefix="/api/executor", dependencies=[Depends(executor_auth)], tags=["executor"])

@operator_router.get("/missions")
def pending():
    return mission_service.pending()

@operator_router.post("/missions/{cid}/decision")
def decision(cid: str, body: HumanDecision):
    return mission_service.decide(cid, body)

@executor_router.post("/claim/{agent_name}")
def claim(agent_name: str):
    return mission_service.claim(agent_name)

@executor_router.post("/jobs/{job_id}/complete")
def complete(job_id: str, body: CompleteJob):
    return mission_service.complete(job_id, body)

@operator_router.get("/missions/{cid}")
def read_mission(cid: str):
    return mission_service.inspect_mission(cid)
