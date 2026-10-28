"""Execute the four specialists against supplied evidence, with durable attempts."""
from flemme_manager.delivery_schemas import DeliveryInput, DeliveryInputError, DeliveryQualityError, DeliveryResult
from flemme_manager.capabilities import quality
from flemme_manager.schemas import ManagerAssessment, MissionStatus, validate_manager_assessment
from flemme_manager.memory.supabase import StorageError
from flemme_manager.workflows.pipeline import run as run_pipeline


def require_qualification(snapshot):
    if snapshot['pending_request_id'] or snapshot['mission']['state'] not in {'qualified','in_progress'}:
        raise StorageError(409)
    assessments=[message['assessment'] for message in snapshot['messages'] if message.get('assessment')]
    if not assessments:
        raise StorageError(409)
    try:
        qualification=validate_manager_assessment(ManagerAssessment.model_validate(assessments[-1]))
    except ValueError as error:
        raise StorageError(409) from error
    if qualification.mission_status != MissionStatus.READY or qualification.selected_workflow.workflow_id is None:
        raise StorageError(409)
    return qualification


async def produce_delivery(memory, conversation_id, request):
    evidence=DeliveryInput(sources=request.sources,constraints=request.constraints)
    # Server picks the saved workflow; users cannot override it with a workflow_id.
    run_id=str(request.request_id)
    payload=evidence.model_dump(mode='json')
    reservation=await memory.delivery_command('reserve',conversation_id,run_id,request.expected_revision,payload)
    if reservation.get('replayed'):
        if not reservation.get('output'):
            raise StorageError(409)
        return reservation
    result=None
    try:
        qualification=require_qualification(reservation['snapshot'])
        workflow=qualification.selected_workflow.workflow_id
        result=DeliveryResult.model_validate(run_pipeline(workflow,qualification.expected_result.description,evidence))
        if result.workflow_id != workflow or result.agents != ['Search','Compare','Writer','Quality']:
            raise DeliveryQualityError('Unexpected workflow result')
        quality.run(workflow,qualification.expected_result.description,result.search,result.comparison,
                    result.markdown,evidence,result.generated_at)
    except (DeliveryInputError, DeliveryQualityError, StorageError) as error:
        await memory.delivery_command('finish',conversation_id,run_id,payload={
            'failure':'insufficient_evidence' if isinstance(error,DeliveryInputError) else 'quality_or_qualification',
            'note':'Production non aboutie ; sources et tentative conservées.',
            'draft':getattr(error,'draft',None) or (result.model_dump(mode='json') if result else None)})
        raise error
    except Exception as error:
        await memory.delivery_command('finish',conversation_id,run_id,payload={
            'failure':'execution_error','note':'Production non aboutie ; sources et tentative conservées.'})
        raise DeliveryQualityError('Specialist execution failed') from error
    return await memory.delivery_command('finish',conversation_id,run_id,payload={
        'result':result.model_dump(mode='json'),
        'agent_activity': [
            {'agent':'Search','status':'completed','task':'Sélection des sources fournies ; aucune recherche Internet'},
            {'agent':'Document','status':'skipped','task':'Aucun document extrait'},
            {'agent':'Compare','status':'completed','task':'Comparaison des critères fournis'},
            {'agent':'Quality','status':'completed','task':'Contrôle de cohérence du rapport'}],
        'note':'Livrable produit à partir des sources fournies.'})
