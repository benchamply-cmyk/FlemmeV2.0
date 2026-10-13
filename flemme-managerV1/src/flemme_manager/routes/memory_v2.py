"""Opt-in V2 routes protected by a verified, confirmed Supabase user session."""
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from flemme_manager.agents.manager import ManagerConfigurationError, ManagerExecutionError
from flemme_manager.memory.service import submit_turn
from flemme_manager.memory.supabase import StorageError, get_memory
from flemme_manager.schemas import RequestText, ShortText

router = APIRouter(prefix="/api/v2", tags=["memory"])


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateConversation(StrictBody):
    conversation_id: UUID


class Turn(StrictBody):
    request_id: UUID
    expected_revision: int = Field(ge=0, le=9223372036854775806)
    request: RequestText


class Event(StrictBody):
    request_id: UUID
    expected_revision: int = Field(ge=0, le=9223372036854775806)
    kind: Literal["status", "action", "result"]
    state: Literal["in_progress", "blocked", "completed", "cancelled"] | None = None
    note: ShortText
    result: RequestText | None = None


class Recovery(StrictBody):
    request_id: UUID
    expected_revision: int = Field(ge=0, le=9223372036854775806)
    note: ShortText


async def execute(memory, operation, conversation_id=None, request_id=None, revision=None, payload=None):
    try:
        return await memory.command(operation, conversation_id, request_id, revision, payload)
    except StorageError as error:
        messages = {404: "Conversation introuvable.", 409: "Conflit : recharge la conversation.",
                    422: "Événement invalide.", 401: "Session invalide."}
        raise HTTPException(error.status, messages.get(error.status, "Le stockage est indisponible.")) from None


@router.post("/conversations", status_code=201)
async def create(body: CreateConversation, memory=Depends(get_memory)):
    return await execute(memory, "create", str(body.conversation_id))


@router.get("/conversations")
async def list_conversations(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0, le=2147483647),
                             memory=Depends(get_memory)):
    return await execute(memory, "list", payload={"limit": limit, "offset": offset})


@router.get("/conversations/{conversation_id}")
async def resume(conversation_id: UUID, memory=Depends(get_memory)):
    return await execute(memory, "snapshot", str(conversation_id))


@router.post("/conversations/{conversation_id}/messages", status_code=201)
async def message(conversation_id: UUID, body: Turn, memory=Depends(get_memory)):
    try:
        return await submit_turn(memory, str(conversation_id), str(body.request_id),
                                 body.request, body.expected_revision)
    except ManagerConfigurationError:
        raise HTTPException(503, "Le service d'analyse est indisponible ; le message est conservé.") from None
    except ManagerExecutionError:
        raise HTTPException(502, "Analyse non aboutie ; le message est conservé.") from None
    except StorageError as error:
        raise HTTPException(error.status, "La conversation n'a pas pu être traitée. Recharge-la.") from None


@router.get("/conversations/{conversation_id}/mission")
async def mission(conversation_id: UUID, memory=Depends(get_memory)):
    snapshot = await execute(memory, "snapshot", str(conversation_id))
    return {"mission": snapshot["mission"], "revision": snapshot["revision"], "events": snapshot["events"]}


@router.post("/conversations/{conversation_id}/mission/events", status_code=201)
async def event(conversation_id: UUID, body: Event, memory=Depends(get_memory)):
    return await execute(memory, "event", str(conversation_id), str(body.request_id),
                         body.expected_revision, body.model_dump(mode="json", exclude={"request_id", "expected_revision"}))


@router.post("/conversations/{conversation_id}/messages/recover")
async def recover(conversation_id: UUID, body: Recovery, memory=Depends(get_memory)):
    return await execute(memory, "recover", str(conversation_id), str(body.request_id),
                         body.expected_revision, {"note": body.note})
