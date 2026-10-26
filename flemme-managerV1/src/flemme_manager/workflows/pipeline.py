"""Sequential specialist orchestration, local and deterministic."""

from datetime import UTC, datetime

from flemme_manager.capabilities import compare, quality, search, reports as writer
from flemme_manager.delivery_schemas import DeliveryInput, DeliveryResult, DeliveryQualityError
from flemme_manager.schemas import WorkflowId


def run(workflow_id: WorkflowId, query: str, evidence: DeliveryInput) -> DeliveryResult:
    generated_at = datetime.now(UTC)
    retrieved = search.run(workflow_id, query, evidence)
    comparison = compare.run(retrieved, evidence)
    markdown = writer.run(workflow_id, retrieved, comparison, evidence, generated_at)
    try:
        checks = quality.run(workflow_id, query, retrieved, comparison, markdown, evidence, generated_at)
    except DeliveryQualityError as error:
        error.draft = {"generated_at": generated_at.isoformat(), "search": retrieved.model_dump(mode="json"),
                       "comparison": comparison.model_dump(mode="json"), "markdown": markdown,
                       "quality_passed": False}
        raise
    return DeliveryResult(workflow_id=workflow_id, generated_at=generated_at,
                          agents=["Search", "Compare", "Writer", "Quality"], search=retrieved,
                          comparison=comparison, markdown=markdown, quality=checks)
