"""One application orchestrator; internal tools never own conversations or credentials.

The SDK Manager qualifies conversation turns. This runtime dispatches explicit,
approved mission commands to bounded tools; no model may grant itself approval.
"""
from typing import Annotated, Literal

from pydantic import Field, model_validator

from flemme_manager.delivery_schemas import DeliveryRequest, StrictModel
from flemme_manager.services.acquisition import Acquire

AGENT = 'Flemme Manager'
TOOL_NAMES = {'Search': 'search', 'Document': 'documents', 'Compare': 'compare',
              'Writer': 'reports', 'Quality': 'quality'}


class AcquisitionCommand(StrictModel):
    kind: Literal['acquisition']
    request: Acquire

    @model_validator(mode='after')
    def explicit_price_basis(self):
        if self.request.constraints.price_basis not in {'total', 'per_month'}:
            raise ValueError('Specify total or per_month for acquisition')
        return self


class DeliveryCommand(StrictModel):
    kind: Literal['delivery']
    request: DeliveryRequest


MissionCommand = Annotated[AcquisitionCommand | DeliveryCommand, Field(discriminator='kind')]


def public_view(value):
    """Project historical role labels without modifying stored results or events."""
    if isinstance(value, list):
        return [public_view(item) for item in value]
    if not isinstance(value, dict):
        return value
    result = {key: public_view(item) for key, item in value.items()}
    if 'agents' in result:
        result['tools'] = [TOOL_NAMES.get(name, name) for name in result.pop('agents')]
        result['agent'] = AGENT
    if result.get('agent') in TOOL_NAMES:
        result['tool'] = TOOL_NAMES[result['agent']]
        result['agent'] = AGENT
    if 'agent_activity' in result:
        result['tool_activity'] = result.pop('agent_activity')
    return result


async def execute_mission(memory, conversation_id, command):
    # Reuse the same approval, feature switches, reservation and recovery boundary
    # as legacy callers. Approval fingerprints bind uploads, budgets and revision.
    from flemme_manager.services.agent_plans import require_approval
    from flemme_manager.routes.acquisition import enabled as acquisition_enabled
    from flemme_manager.routes.deliveries_v3 import enabled as delivery_enabled
    from flemme_manager.services.acquisition import produce
    from flemme_manager.services.delivery_v3 import produce_delivery
    from flemme_manager.services.run_budget import paid_budget_required

    if command.kind == 'acquisition':
        acquisition_enabled()
    else:
        delivery_enabled()
    await require_approval(memory, conversation_id, command.kind, command.request)
    run = produce if command.kind == 'acquisition' else produce_delivery
    token = paid_budget_required.set(True)
    try:
        return await run(memory, conversation_id, command.request)
    finally:
        paid_budget_required.reset(token)
