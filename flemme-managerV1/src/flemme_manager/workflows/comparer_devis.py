"""Quote comparison workflow placeholder."""

# V3: implementation recovered from the preserved local specialist branch.
"""Generate an evidence-based comparison of supplied quotes."""
from flemme_manager.schemas import WorkflowId
from flemme_manager.workflows.pipeline import run as run_pipeline


def run(query, evidence):
    return run_pipeline(WorkflowId.COMPARER_DEVIS, query, evidence)
