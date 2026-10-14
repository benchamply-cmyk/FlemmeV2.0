"""Service provider discovery workflow placeholder."""

# V3: implementation recovered from the preserved local specialist branch.
"""Compare supplied provider candidates without claiming web discovery."""
from flemme_manager.schemas import WorkflowId
from flemme_manager.workflows.pipeline import run as run_pipeline


def run(query, evidence):
    return run_pipeline(WorkflowId.TROUVER_PRESTATAIRE, query, evidence)
