"""Canonical HTTP flow, exact approvals and reported leasing failure regressions.

Leasing wording is an anonymised reconstruction of the 21/10 report, not a
verbatim export of a customer's conversation. No production content is changed.
"""
import asyncio
from copy import deepcopy
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException

from flemme_manager.main import app
from flemme_manager.memory import service
from flemme_manager.memory.supabase import get_memory
from flemme_manager.services import acquisition, run_budget
from flemme_manager.services.manager_runtime import public_view
from flemme_manager.services.qualification_policy import qualify_locally
from flemme_manager.schemas import UserRequest
from test_agent_plans import Memory, CID, request as acquisition_request
from test_acquisition import doc

LEASING = 'Trouve-moi trois offres de leasing pour une voiture hybride à moins de 300 € par mois.'


@pytest.mark.parametrize('text', [LEASING, LEASING.replace('€ par mois', 'EUR/mois'),
    LEASING + ' Sans préférence de marque, partout en France.'])
def test_leasing_is_qualified_without_optional_brand_or_city(text):
    assessment = qualify_locally(UserRequest(request=text))
    assert assessment.mission_status.value == 'ready'
    assert assessment.selected_workflow.workflow_id.value == 'rechercher_produit'
    assert assessment.qualification_questions == assessment.missing_information == []
    assert 'encore vérifiés' in assessment.user_response.message


def test_leasing_budget_question_is_the_only_required_question():
    result = qualify_locally(UserRequest(request='Cherche une voiture hybride en leasing.'))
    assert result.mission_status.value == 'needs_information'
    assert [item.name for item in result.missing_information] == ['monthly_budget']


def test_leasing_purchase_is_never_authorized_by_a_qualified_search():
    result = qualify_locally(UserRequest(request=LEASING + ' Signe le contrat et paie.'))
    assert result.human_intervention_required
    assert result.mission_status.value == 'human_intervention_required'


def test_reported_followups_use_saved_user_context_without_a_model(monkeypatch):
    async def forbidden(*args, **kwargs):
        pytest.fail('Leasing clarification must not call OpenAI')
    monkeypatch.setattr(service.Runner, 'run', forbidden)
    messages = [{'role': 'user', 'content': LEASING},
                {'role': 'assistant', 'content': 'Quelle marque et quelle ville ?'},
                {'role': 'user', 'content': 'Sans préférence de marque, en France.'}]
    result = asyncio.run(service.analyze_history({'messages': messages}, messages[-1]['content']))
    assert result.mission_status.value == 'ready'
    assert len(messages) == 3  # Preserves the historic failed exchange.


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setenv('FLEMME_V3_ENABLED', 'true')
    monkeypatch.setenv('FLEMME_ACQUISITION_ENABLED', 'true')
    memory = Memory()
    app.dependency_overrides[get_memory] = lambda: memory
    try:
        yield TestClient(app), memory
    finally:
        app.dependency_overrides.clear()


def test_unified_plan_approval_and_execution_keep_one_agent(api, monkeypatch):
    client, memory = api
    calls = []
    async def produce(*args):
        assert run_budget.paid_budget_required.get()
        calls.append(args)
        return {'result': {'agents': ['Search', 'Compare', 'Writer', 'Quality'], 'markdown': 'Saved report'}}
    monkeypatch.setattr(acquisition, 'produce', produce)
    command = {'kind': 'acquisition', 'request': acquisition_request()}
    base = f'/api/manager/conversations/{CID}'
    assert client.post(base + '/missions', json=command).status_code == 409
    assert calls == []
    plan = client.post(base + '/plans', json={'plan_id': str(uuid4()), **command})
    assert plan.status_code == 201
    plan = plan.json()['plan']
    assert {step['agent'] for step in plan['steps']} == {'Flemme Manager'}
    assert [step['tool'] for step in plan['steps']] == ['search', 'compare', 'quality']
    approval = client.post(base + '/plans/' + plan['id'] + '/approve', json={
        'request_id': str(uuid4()), 'expected_revision': 3, 'approved': True})
    assert approval.status_code == 200 and calls == []
    command['request'].update(approval_id=approval.json()['approval_id'], expected_revision=4)
    result = client.post(base + '/missions', json=command)
    assert result.status_code == 201
    assert result.json()['result']['agent'] == 'Flemme Manager'
    assert result.json()['result']['tools'] == ['search', 'compare', 'reports', 'quality']
    assert len(calls) == 1
    assert not run_budget.paid_budget_required.get()


def test_canonical_projection_never_rewrites_historic_events():
    original = {'events': [{'payload': {'agents': ['Search'], 'agent_activity': [{'agent': 'Quality'}]}}]}
    before = deepcopy(original)
    projected = public_view(original)
    assert projected['events'][0]['payload']['tool_activity'][0]['tool'] == 'quality'
    assert original == before


def test_native_and_legacy_resume_read_the_same_storage(api):
    client, memory = api
    original = deepcopy(memory.snapshot)
    assert client.get(f'/api/manager/conversations/{CID}').json() == original
    assert client.get(f'/api/v2/conversations/{CID}').json() == original
    assert memory.snapshot == original


def test_customer_cannot_prepare_or_execute_native_tools(api):
    client, memory = api
    memory.role = False
    assert client.get('/api/manager/capabilities').status_code == 403
    assert client.post(f'/api/manager/conversations/{CID}/missions', json={
        'kind': 'acquisition', 'request': acquisition_request()}).status_code == 403


def test_validation_does_not_echo_document_or_secret_values(api):
    client, _ = api
    body = {'kind': 'acquisition', 'request': acquisition_request()}
    body['request']['owner_id'] = 'private-value-must-not-be-echoed'
    response = client.post(f'/api/manager/conversations/{CID}/missions', json=body)
    assert response.status_code == 422
    assert 'private-value' not in response.text


def test_request_size_rejected_before_validation(api):
    client, _ = api
    result = client.post(f'/api/manager/conversations/{CID}/analysis', content='x' * 64001,
                         headers={'content-type': 'application/json'})
    assert result.status_code == 413


@pytest.mark.parametrize('ceiling,estimate', [(None, None), ('0.10', '0.11'), ('NaN', '0.01'),
    ('Infinity', '0.01'), ('0.10', '-1'), ('100', '1')])
def test_invalid_paid_budget_refuses_before_provider(monkeypatch, ceiling, estimate):
    for name, value in [('FLEMME_RUN_BUDGET_USD', ceiling), ('FLEMME_WEB_RUN_UPPER_USD', estimate)]:
        if value is None: monkeypatch.delenv(name, raising=False)
        else: monkeypatch.setenv(name, value)
    with pytest.raises(HTTPException) as error:
        run_budget.check_web_budget()
    assert error.value.status_code == 503


def test_explicit_budget_accepts_admission(monkeypatch):
    monkeypatch.setenv('FLEMME_RUN_BUDGET_USD', '0.10')
    monkeypatch.setenv('FLEMME_WEB_RUN_UPPER_USD', '0.05')
    run_budget.check_web_budget()


def test_total_web_price_uses_total_basis_not_leasing(api):
    from flemme_manager.tools.evidence_extraction import extract
    source = extract('one', 'Machine', 'web', {1: 'Prix total : 980 EUR TTC.'}, url='https://example.com')
    body = acquisition_request()
    body['constraints'].update(max_price='1000', price_basis='total')
    result = acquisition.report([source], acquisition.Acquire.model_validate(body), 'rechercher_produit', {})
    assert result['comparison'][0]['within_budget'] is True


def test_openapi_exposes_typed_discriminated_mission_contract():
    schema = app.openapi()
    operation = schema['paths']['/api/manager/conversations/{conversation_id}/missions']['post']
    body = operation['requestBody']['content']['application/json']['schema']
    assert body['discriminator']['propertyName'] == 'kind'
    assert len(body['oneOf']) == 2
