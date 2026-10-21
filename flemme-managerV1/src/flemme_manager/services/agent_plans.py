"""Append-only action plans and explicit approvals, bound to exact execution input."""
import hashlib
import json
from uuid import UUID
from typing import Literal
from fastapi import HTTPException
from pydantic import Field, StrictBool
from flemme_manager.delivery_schemas import StrictModel, DeliveryRequest
from flemme_manager.services.acquisition import Acquire, uploads
from flemme_manager.services.delivery_v3 import require_qualification
from flemme_manager.memory.supabase import StorageError


class PlanRequest(StrictModel):
    plan_id: UUID
    kind: Literal['acquisition', 'delivery']
    request: dict


class Approval(StrictModel):
    request_id: UUID
    expected_revision: int = Field(ge=0, le=9223372036854775805)
    approved: StrictBool


def fingerprint(kind, request):
    data = request.model_dump(mode='json', exclude={'approval_id', 'expected_revision'})
    # Bind the original bytes without copying uploads into the plan/history.
    if kind == 'acquisition':
        data['documents'] = [{'name': doc.name, 'sha256': digest} for doc, _, digest in uploads(request)]
    return hashlib.sha256(json.dumps({'kind': kind, 'input': data}, sort_keys=True,
                                    separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def describe(kind, request):
    constraints = request.constraints.model_dump(mode='json', exclude_none=True)
    web = kind == 'acquisition' and request.mode == 'web'
    documents = kind == 'acquisition' and request.mode == 'documents'
    steps = []
    if web:
        steps.append({'agent': 'Search', 'actions': ['Rechercher sur Internet avec la requête validée',
            'Lire les sources accessibles et conserver leurs références et dates'],
            'parameters': {'query': request.query}})
    elif documents:
        steps.append({'agent': 'Document', 'actions': ['Extraire le texte des documents validés',
            'Conserver les références de pages PDF ou blocs DOCX/TXT, signaler les limites'],
            'parameters': {'documents': [doc.name for doc in request.documents]}})
    else:
        steps.append({'agent': 'Search', 'actions': ['Sélectionner les sources fournies, sans navigation Internet'],
            'parameters': {'sources': [{'id': s.id, 'title': s.title} for s in request.sources]}})
    steps.extend([
        {'agent': 'Compare', 'actions': ['Comparer les prix sur des bases, devises et taxes compatibles',
            'Examiner les conditions disponibles et conserver les valeurs inconnues'], 'parameters': constraints},
        {'agent': 'Quality', 'actions': ['Contrôler la cohérence des citations et des calculs pris en charge',
            'Signaler les informations manquantes et les limites avant décision humaine'], 'parameters': {'required': True}},
    ])
    return steps


async def prepare(memory, cid, body):
    model = (Acquire if body.kind == 'acquisition' else DeliveryRequest).model_validate(body.request)
    if model.approval_id is not None:
        raise HTTPException(422, 'Un nouveau plan ne doit pas réutiliser une approbation.')
    digest = fingerprint(body.kind, model)
    snapshot = await memory.command('snapshot', cid)
    prior = next((e.get('payload', {}).get('agent_plan') for e in snapshot.get('events', [])
                  if e.get('request_id') == str(body.plan_id)), None)
    if prior:
        if prior.get('fingerprint') != digest: raise StorageError(409)
        return {'plan': prior, 'snapshot': snapshot}
    qualification = require_qualification(snapshot)
    workflow = qualification.selected_workflow.workflow_id.value
    if model.expected_revision != snapshot['revision']:
        raise StorageError(409)
    if body.kind == 'acquisition' and ((model.mode == 'documents') != (workflow == 'comparer_devis')):
        raise HTTPException(422, 'Le mode doit correspondre à la mission qualifiée.')
    plan = {'id': str(body.plan_id), 'kind': body.kind, 'fingerprint': digest,
            'workflow_id': workflow, 'execution_request_id': str(model.request_id),
            'steps': describe(body.kind, model), 'status': 'proposed'}
    saved = await memory.command('event', cid, str(body.plan_id), model.expected_revision,
        {'kind': 'action', 'state': None, 'note': 'Plan des agents proposé ; exécution en attente de validation.',
         'agent_plan': plan})
    return {'plan': plan, 'snapshot': saved}


def find_plan(snapshot, plan_id):
    for event in snapshot.get('events', []):
        plan = event.get('payload', {}).get('agent_plan')
        if plan and plan.get('id') == str(plan_id):
            return plan, event
    raise HTTPException(404, 'Plan introuvable.')


async def approve(memory, cid, plan_id, body):
    if body.approved is not True:
        raise HTTPException(422, 'Une validation explicite est requise.')
    snapshot = await memory.command('snapshot', cid)
    plan, event = find_plan(snapshot, plan_id)
    prior = next((e.get('payload', {}).get('agent_plan_approval') for e in snapshot.get('events', [])
                  if e.get('request_id') == str(body.request_id)), None)
    if prior:
        if prior.get('plan_id') != str(plan_id) or prior.get('fingerprint') != plan['fingerprint']: raise StorageError(409)
        return {'approval_id': str(body.request_id), 'snapshot': snapshot, 'plan': plan}
    require_qualification(snapshot)
    if snapshot['revision'] != body.expected_revision or event['revision'] != snapshot['revision']:
        raise StorageError(409)
    saved = await memory.command('event', cid, str(body.request_id), body.expected_revision,
        {'kind': 'action', 'state': None, 'note': 'Plan des agents validé explicitement par l’administrateur.',
         'agent_plan_approval': {'approved_by': getattr(memory, 'user_id', None), 'plan_id': str(plan_id), 'fingerprint': plan['fingerprint'],
                                 'workflow_id': plan['workflow_id'],
                                 'execution_request_id': plan['execution_request_id']}})
    return {'approval_id': str(body.request_id), 'snapshot': saved, 'plan': plan}


async def require_approval(memory, cid, kind, request):
    if request.approval_id is None:
        raise HTTPException(409, 'Prépare puis valide le plan des agents avant exécution.')
    snapshot = await memory.command('snapshot', cid)
    approval_event = next((e for e in snapshot.get('events', [])
                           if e.get('request_id') == str(request.approval_id)), None)
    approval = (approval_event or {}).get('payload', {}).get('agent_plan_approval')
    if not approval or approval.get('fingerprint') != fingerprint(kind, request):
        raise HTTPException(409, 'La demande a changé ou son plan n’est pas validé.')
    plan, _ = find_plan(snapshot, approval['plan_id'])
    if plan['kind'] != kind or approval['execution_request_id'] != str(request.request_id):
        raise StorageError(409)
    # After a reservation, only the identical run may replay its stored result.
    replay = any(e.get('revision') == approval_event['revision'] + 1
                 and e.get('payload', {}).get('run_id') == str(request.request_id)
                 for e in snapshot.get('events', []))
    if not replay:
        qualification = require_qualification(snapshot)
        if (snapshot['revision'] != approval_event['revision']
                or request.expected_revision != snapshot['revision']
                or qualification.selected_workflow.workflow_id.value != approval['workflow_id']):
            raise StorageError(409)
    return approval
