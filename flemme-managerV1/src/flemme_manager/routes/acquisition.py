"""Authenticated JSON upload with a streaming body cap before decoding."""
import base64
import os
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import ValidationError
from flemme_manager.memory.supabase import get_memory, get_admin_memory, StorageError
from flemme_manager.routes.deliveries_v3 import enabled as v3_enabled
from flemme_manager.services.acquisition import Acquire, produce
from flemme_manager.acquisition_schemas import AcquisitionError


def enabled():
    v3_enabled()
    if os.getenv('FLEMME_ACQUISITION_ENABLED', '').lower() != 'true':
        raise HTTPException(503, 'Recherche web et documents non activés.')


router = APIRouter(prefix='/api/v4/conversations', tags=['acquisition'], dependencies=[Depends(enabled)])


@router.post('/{conversation_id}/acquisitions', status_code=201)
async def acquire(conversation_id: UUID, request: Request, memory=Depends(get_admin_memory)):
    if request.headers.get('content-type', '').split(';')[0] != 'application/json':
        raise HTTPException(415, 'Format JSON requis.')
    body = bytearray()
    async for part in request.stream():
        body.extend(part)
        if len(body) > 4_100_000:
            raise HTTPException(413, 'Trois documents de 1 Mo maximum.')
    try:
        model = Acquire.model_validate_json(body)
        return await produce(memory, str(conversation_id), model)
    except ValidationError:
        raise HTTPException(422, 'Requête ou documents invalides.') from None
    except AcquisitionError as error:
        raise HTTPException(422, str(error)) from None
    except StorageError as error:
        raise HTTPException(error.status, 'Acquisition indisponible. Consulte les tentatives avant de réessayer.') from None


@router.get('/{conversation_id}/acquisitions/{run_id}/documents/{index}')
async def document(conversation_id: UUID, run_id: UUID, index: int, memory=Depends(get_memory)):
    try:
        rows = await memory.request('POST', '/rest/v1/rpc/fm_v4_originals', {
            'p_conversation_id': str(conversation_id), 'p_run_id': str(run_id)})
        if not 0 <= index < len(rows):
            raise HTTPException(404, 'Document introuvable.')
        row = rows[index]
        return Response(base64.b64decode(row['content_base64'], validate=True), media_type='application/octet-stream',
                        headers={'Content-Disposition': 'attachment', 'Cache-Control': 'no-store',
                                 'X-Content-Type-Options': 'nosniff'})
    except StorageError as error:
        raise HTTPException(error.status, 'Document indisponible.') from None
