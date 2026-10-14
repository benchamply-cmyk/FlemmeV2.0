"""Authenticated, opt-in specialist execution and preserved results."""
import os
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from flemme_manager.delivery_schemas import DeliveryInputError, DeliveryQualityError, DeliveryRequest
from flemme_manager.memory.supabase import get_memory, StorageError
from flemme_manager.routes.memory_v2 import Recovery
from flemme_manager.services.delivery_v3 import produce_delivery


def enabled():
    if os.getenv('FLEMME_V3_ENABLED','').lower()!='true':
        raise HTTPException(503,'Les agents exécutants V3 sont désactivés.')

router=APIRouter(prefix='/api/v3/conversations',tags=['specialists'],dependencies=[Depends(enabled)])


@router.post('/{conversation_id}/deliveries',status_code=201)
async def execute(conversation_id:UUID,request:DeliveryRequest,memory=Depends(get_memory)):
    try:
        return await produce_delivery(memory,str(conversation_id),request)
    except DeliveryInputError:
        raise HTTPException(422,'Sources insuffisantes pour la mission ; tentative conservée.') from None
    except DeliveryQualityError:
        raise HTTPException(502,'Le contrôle qualité a refusé le livrable ; tentative conservée.') from None
    except StorageError as error:
        raise HTTPException(error.status,'Le livrable ne peut pas être produit. Actualise la mission.') from None


@router.get('/{conversation_id}/deliveries')
async def read(conversation_id:UUID,memory=Depends(get_memory)):
    try:
        return await memory.delivery_command('list',str(conversation_id))
    except StorageError as error:
        raise HTTPException(error.status,'Livrables indisponibles.') from None


@router.post('/{conversation_id}/deliveries/recover')
async def recover(conversation_id:UUID,request:Recovery,memory=Depends(get_memory)):
    try:
        return await memory.delivery_command('recover',str(conversation_id),str(request.request_id),
                                             request.expected_revision,{'note':request.note})
    except StorageError as error:
        raise HTTPException(error.status,'La tentative ne peut pas être libérée.') from None
