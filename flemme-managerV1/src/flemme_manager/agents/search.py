"""Search agent placeholder."""

# V3: implementation recovered from the preserved local specialist branch.
"""Search specialist: retrieve and rank supplied evidence, without web claims."""

import re

from flemme_manager.delivery_schemas import DeliveryInput, DeliveryInputError, SearchResult
from flemme_manager.schemas import WorkflowId
from flemme_manager.text_utils import normalized

KIND_BY_WORKFLOW = {
    WorkflowId.COMPARER_DEVIS: "quote",
    WorkflowId.TROUVER_PRESTATAIRE: "provider",
    WorkflowId.RECHERCHER_PRODUIT: "product",
    WorkflowId.ORGANISER_VOYAGE: "travel",
}


def terms(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z0-9]+", normalized(text)) if len(word) >= 4}


def run(workflow_id: WorkflowId, query: str, evidence: DeliveryInput) -> SearchResult:
    kind = KIND_BY_WORKFLOW[workflow_id]
    relevant = [source for source in evidence.sources if source.kind == kind]
    minimum = 2 if workflow_id == WorkflowId.COMPARER_DEVIS else 1
    if len(relevant) < minimum:
        raise DeliveryInputError(f"At least {minimum} supplied {kind} sources are required")
    query_terms = terms(query)
    relevant.sort(key=lambda source: -len(query_terms & terms(source.title + " " + source.text)))
    return SearchResult(source_ids=[source.id for source in relevant],
                        excluded_ids=[source.id for source in evidence.sources if source.kind != kind])
