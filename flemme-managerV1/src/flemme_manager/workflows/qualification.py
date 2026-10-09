"""Deterministic qualification and routing tools, never delegated to the LLM."""
from flemme_manager.qualification_models import QualificationAssessment
from flemme_manager.schemas import MissionStatus, WorkflowId

REQUIRED = {
    WorkflowId.COMPARER_DEVIS: ("scope", "documents_summary", "success_criteria"),
    WorkflowId.TROUVER_PRESTATAIRE: ("scope", "location", "budget", "deadline"),
    WorkflowId.RECHERCHER_PRODUIT: ("scope", "budget", "success_criteria"),
    WorkflowId.ORGANISER_VOYAGE: ("scope", "location", "budget", "deadline", "constraints"),
}
QUESTIONS = {
    "scope": "Quel résultat concret veux-tu obtenir ?",
    "location": "Dans quelle ville ou destination ?",
    "budget": "Quel budget maximum, ou souhaites-tu d’abord un devis ?",
    "deadline": "Pour quand, ou sans échéance particulière ?",
    "success_criteria": "Quels critères permettront de choisir le bon résultat ?",
    "constraints": "Combien de personnes et quelles contraintes faut-il respecter ?",
    "documents_summary": "Peux-tu recopier les montants et les détails des devis ? Les fichiers seront examinés par l’équipe.",
}
# Only preparation tasks. No worker is authorized to buy, book, call or send messages.
AGENTS = {
    WorkflowId.COMPARER_DEVIS: ["compare", "quality", "writer"],
    WorkflowId.TROUVER_PRESTATAIRE: ["search", "quality", "writer"],
    WorkflowId.RECHERCHER_PRODUIT: ["search", "compare", "quality", "writer"],
    WorkflowId.ORGANISER_VOYAGE: ["search", "compare", "quality", "writer"],
}

def qualification_summary(assessment: QualificationAssessment):
    workflow = assessment.selected_workflow.workflow_id
    missing = [name for name in REQUIRED.get(workflow, ()) if not getattr(assessment.facts, name)]
    human = assessment.mission_status in (MissionStatus.HUMAN_INTERVENTION_REQUIRED, MissionStatus.OUT_OF_CATALOG)
    ready = assessment.mission_status == MissionStatus.READY and not missing
    questions = [] if human else [QUESTIONS[name] for name in missing[:2]]
    if not questions and not human and not ready:
        questions = [q.question for q in assessment.qualification_questions][:2]
    return {
        "ready": ready, "human_required": human, "missing_fields": missing,
        "questions": questions, "expected_result": assessment.expected_result.description,
        "facts": assessment.facts.model_dump(), "workflow": workflow,
        "agents": AGENTS.get(workflow, []),
        "external_actions_authorized": False,
    }
