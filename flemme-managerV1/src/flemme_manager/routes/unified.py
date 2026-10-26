"""Canonical API surface; legacy URLs keep their exact contracts during migration."""
from functools import wraps
from uuid import UUID
from fastapi import APIRouter, Body, Depends, HTTPException

from flemme_manager.memory.supabase import get_admin_memory, StorageError
from flemme_manager.delivery_schemas import DeliveryInputError, DeliveryQualityError
from flemme_manager.acquisition_schemas import AcquisitionError
from flemme_manager.routes import memory_v2, agent_plans, acquisition, deliveries_v3
from flemme_manager.services.manager_runtime import (
    AGENT, AcquisitionCommand, DeliveryCommand, execute_mission, public_view,
)

router = APIRouter(prefix='/api/manager', tags=['Flemme Manager'])


def alias(path, handler, methods, status=200):
    @wraps(handler)
    async def projected(*args, **kwargs):
        value = await handler(*args, **kwargs)
        # Download responses are already authenticated and have no-store headers.
        return public_view(value) if isinstance(value, (dict, list)) else value
    dependencies = []
    if '/results' in path or '/missions/recover' in path:
        dependencies = [Depends(deliveries_v3.enabled)]
    if '/documents/' in path:
        dependencies = [Depends(acquisition.enabled)]
    router.add_api_route(path, projected, methods=methods, status_code=status, dependencies=dependencies)


alias('/access', memory_v2.access, ['GET'])
alias('/conversations', memory_v2.create, ['POST'], 201)
alias('/conversations', memory_v2.list_conversations, ['GET'])
alias('/conversations/{conversation_id}', memory_v2.resume, ['GET'])
alias('/conversations/{conversation_id}/analysis', memory_v2.message, ['POST'], 201)
alias('/conversations/{conversation_id}/analysis/recover', memory_v2.recover, ['POST'])
alias('/conversations/{conversation_id}/mission', memory_v2.mission, ['GET'])
alias('/conversations/{conversation_id}/mission/events', memory_v2.event, ['POST'], 201)
alias('/conversations/{conversation_id}/plans', agent_plans.propose, ['POST'], 201)
alias('/conversations/{conversation_id}/plans/{plan_id}/approve', agent_plans.accept, ['POST'])
alias('/conversations/{conversation_id}/results', deliveries_v3.read, ['GET'])
alias('/conversations/{conversation_id}/missions/recover', deliveries_v3.recover, ['POST'])
alias('/conversations/{conversation_id}/missions/{run_id}/documents/{index}', acquisition.document, ['GET'])


@router.get('/capabilities')
async def capabilities(memory=Depends(get_admin_memory)):
    return {'agent': AGENT, 'tools': ['search', 'documents', 'compare', 'reports', 'quality'],
            'external_actions': False, 'execution_requires_approval': True,
            'contract_version': '1'}


@router.post('/conversations/{conversation_id}/missions', status_code=201)
async def mission(conversation_id: UUID,
                  body: AcquisitionCommand | DeliveryCommand = Body(discriminator='kind'),
                  memory=Depends(get_admin_memory)):
    try:
        return public_view(await execute_mission(memory, str(conversation_id), body))
    except StorageError as error:
        raise HTTPException(error.status, 'Mission indisponible. Recharge les tentatives enregistrées.') from None
    except (AcquisitionError, DeliveryInputError):
        raise HTTPException(422, 'Sources ou documents invalides ; consulte les tentatives.') from None
    except DeliveryQualityError:
        raise HTTPException(502, 'Le contrôle qualité a refusé le livrable ; tentative conservée.') from None
