"""Pydantic models for manager requests, decisions, and responses."""

from enum import StrEnum
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
)

RequestText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=5000),
]
ShortText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=300),
]
LabelText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
]
ReasonText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
]
ResponseText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=1000),
]


class HealthResponse(BaseModel):
    status: str


class UserRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request: RequestText


class ServiceCategory(StrEnum):
    QUOTE_COMPARISON = "quote_comparison"
    SERVICE_PROVIDER = "service_provider"
    PRODUCT_RESEARCH = "product_research"
    TRAVEL = "travel"
    OTHER = "other"


class WorkflowId(StrEnum):
    COMPARER_DEVIS = "comparer_devis"
    TROUVER_PRESTATAIRE = "trouver_prestataire"
    RECHERCHER_PRODUIT = "rechercher_produit"
    ORGANISER_VOYAGE = "organiser_voyage"


WORKFLOW_BY_CATEGORY = {
    ServiceCategory.QUOTE_COMPARISON: WorkflowId.COMPARER_DEVIS,
    ServiceCategory.SERVICE_PROVIDER: WorkflowId.TROUVER_PRESTATAIRE,
    ServiceCategory.PRODUCT_RESEARCH: WorkflowId.RECHERCHER_PRODUIT,
    ServiceCategory.TRAVEL: WorkflowId.ORGANISER_VOYAGE,
}


class ExpectedResult(BaseModel):
    description: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=500),
    ]


class SelectedWorkflow(BaseModel):
    workflow_id: WorkflowId | None
    reason: ShortText


class MissingInformation(BaseModel):
    name: LabelText
    reason: ShortText


class QualificationQuestion(BaseModel):
    question: ShortText
    why_needed: ReasonText
    priority: int = Field(ge=1, le=2)


class MissionStatus(StrEnum):
    READY = "ready"
    NEEDS_INFORMATION = "needs_information"
    OUT_OF_CATALOG = "out_of_catalog"
    HUMAN_INTERVENTION_REQUIRED = "human_intervention_required"


class UserFacingResponse(BaseModel):
    message: ResponseText


class ManagerAssessment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    service_category: ServiceCategory
    expected_result: ExpectedResult
    selected_workflow: SelectedWorkflow
    missing_information: list[MissingInformation] = Field(max_length=8)
    qualification_questions: list[QualificationQuestion] = Field(max_length=2)
    mission_status: MissionStatus
    human_intervention_required: bool
    user_response: UserFacingResponse


class MissionCoherenceError(ValueError):
    """Raised when a structured model response combines incompatible mission fields."""


def validate_manager_assessment(assessment: ManagerAssessment) -> ManagerAssessment:
    """Reject semantically inconsistent output without silently changing it."""
    errors = []
    category = assessment.service_category
    workflow = assessment.selected_workflow.workflow_id
    mission_status = assessment.mission_status

    if category == ServiceCategory.OTHER:
        if workflow is not None:
            errors.append("Category 'other' cannot select a catalog workflow.")
        if mission_status not in (
            MissionStatus.OUT_OF_CATALOG,
            MissionStatus.HUMAN_INTERVENTION_REQUIRED,
        ):
            errors.append("Category 'other' must be out of catalog or require human intervention.")
    else:
        expected_workflow = WORKFLOW_BY_CATEGORY[category]
        if workflow != expected_workflow:
            errors.append(
                f"Category '{category.value}' requires workflow '{expected_workflow.value}'."
            )

    if mission_status == MissionStatus.OUT_OF_CATALOG and category != ServiceCategory.OTHER:
        errors.append("Out-of-catalog missions must use category 'other'.")

    if mission_status == MissionStatus.NEEDS_INFORMATION:
        if not assessment.missing_information or not assessment.qualification_questions:
            errors.append("Missions needing information must identify and ask for it.")
    elif mission_status in (MissionStatus.READY, MissionStatus.OUT_OF_CATALOG):
        if assessment.missing_information or assessment.qualification_questions:
            errors.append("This mission status cannot list missing information or questions.")

    needs_human = mission_status == MissionStatus.HUMAN_INTERVENTION_REQUIRED
    if assessment.human_intervention_required != needs_human:
        errors.append("Human intervention flag must match the mission status.")

    if errors:
        raise MissionCoherenceError(" ".join(errors))
    return assessment


class MissionResponse(ManagerAssessment):
    request: UserRequest