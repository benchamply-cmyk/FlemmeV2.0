"""Deterministic quality tool owned by Flemme Manager."""
from datetime import datetime

from flemme_manager.capabilities import compare, search, reports as writer
from flemme_manager.delivery_schemas import (
    ComparisonResult, DeliveryInput, DeliveryQualityError, QualityResult, SearchResult,
)
from flemme_manager.schemas import WorkflowId


def run(workflow_id: WorkflowId, query: str, retrieved: SearchResult,
        comparison: ComparisonResult, markdown: str, evidence: DeliveryInput,
        generated_at: datetime) -> QualityResult:
    expected_search = search.run(workflow_id, query, evidence)
    if retrieved != expected_search:
        raise DeliveryQualityError("Evidence selection/provenance mismatch")
    expected_comparison = compare.run(retrieved, evidence)
    if comparison != expected_comparison:
        raise DeliveryQualityError("Calculation or criteria mismatch")
    expected_document = writer.run(workflow_id, retrieved, comparison, evidence, generated_at)
    if markdown != expected_document:
        raise DeliveryQualityError("Draft differs from the grounded report")
    return QualityResult(checks=["source_ids", "workflow_evidence_kind", "decimal_prices",
                                "currency_basis_tax_separation", "unknown_information",
                                "source_dates", "no_external_action_claim", "grounded_report"])
