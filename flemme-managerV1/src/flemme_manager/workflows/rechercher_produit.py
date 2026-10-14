"""Product research workflow placeholder."""

# V3: implementation recovered from the preserved local specialist branch.
"""Compare supplied product evidence and explicitly flag missing specs."""
from flemme_manager.schemas import WorkflowId
from flemme_manager.workflows.pipeline import run as run_pipeline


def run(query, evidence):
    return run_pipeline(WorkflowId.RECHERCHER_PRODUIT, query, evidence)
