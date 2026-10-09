"""The model proposes facts; application code owns state and authorizations."""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from flemme_manager.schemas import ManagerAssessment

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1500)]
Fact = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

class MissionFacts(StrictModel):
    scope: Fact | None = None
    location: Fact | None = None
    budget: Fact | None = None
    deadline: Fact | None = None
    success_criteria: Fact | None = None
    constraints: Fact | None = None
    documents_summary: Annotated[str, StringConstraints(max_length=4000)] | None = None

class QualificationAssessment(ManagerAssessment):
    facts: MissionFacts

class StartConversation(StrictModel):
    task: Text
    consent: Literal[True]

class SendMessage(StrictModel):
    message: Text
    version: int = Field(ge=0)
    request_id: Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9-]{8,64}$")]

class ConfirmMission(StrictModel):
    version: int = Field(ge=0)
    consent: Literal[True]
    contact: Annotated[str, StringConstraints(strip_whitespace=True, min_length=8, max_length=120)]
    reference: Annotated[str, StringConstraints(pattern=r"^FL-[A-Z2-9]{5}$")]

class HumanDecision(StrictModel):
    approve: bool
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=300)]

class CompleteJob(StrictModel):
    lease_token: Annotated[str, StringConstraints(min_length=20, max_length=100)]
    result: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]
