"""Prepare and approve specialist actions without executing tools."""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError
from flemme_manager.memory.supabase import get_admin_memory, StorageError
from flemme_manager.services.agent_plans import PlanRequest, Approval, prepare, approve
from flemme_manager.acquisition_schemas import AcquisitionError

router = APIRouter(prefix='/api/v2/conversations', tags=['agent-plans'])


@router.post('/{conversation_id}/agent-plans', status_code=201)
async def propose(conversation_id: UUID, request: Request, memory=Depends(get_admin_memory)):
    if request.headers.get('content-type', '').split(';')[0] != 'application/json':
        raise HTTPException(415, 'Format JSON requis.')
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 4_100_000:
            raise HTTPException(413, 'Plan trop volumineux.')
    try:
        return await prepare(memory, str(conversation_id), PlanRequest.model_validate_json(body))
    except (ValidationError, AcquisitionError):
        raise HTTPException(422, 'Demande du plan invalide.') from None
    except StorageError as error:
        raise HTTPException(error.status, 'La mission a changé ou le stockage est indisponible.') from None


@router.post('/{conversation_id}/agent-plans/{plan_id}/approve')
async def accept(conversation_id: UUID, plan_id: UUID, body: Approval, memory=Depends(get_admin_memory)):
    try:
        return await approve(memory, str(conversation_id), str(plan_id), body)
    except StorageError as error:
        raise HTTPException(error.status, 'Plan périmé : prépare un nouveau plan avant validation.') from None
