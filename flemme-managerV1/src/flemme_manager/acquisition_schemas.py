"""Acquisition evidence: literal citations, never inferred missing conditions."""
from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import Field
from flemme_manager.delivery_schemas import StrictModel, Constraints


class AcquisitionRequest(StrictModel):
    request_id: UUID
    expected_revision: int = Field(ge=0, le=9223372036854775805)
    query: str = Field(min_length=4, max_length=1000)
    constraints: Constraints = Field(default_factory=Constraints)


class Citation(StrictModel):
    page: int = Field(ge=1)
    quote: str = Field(min_length=1, max_length=1200)


class Fact(StrictModel):
    value: str | None = None
    status: Literal['verified', 'estimated', 'unknown'] = 'unknown'
    citations: list[Citation] = Field(default_factory=list)


class AcquiredSource(StrictModel):
    id: str
    title: str
    origin: Literal['web', 'document']
    url: str | None = None
    sha256: str | None = None
    observed_at: datetime
    pages: dict[int, str]
    facts: dict[str, Fact]
    warnings: list[str] = Field(default_factory=list)
    # Verification describes an explicit value in a retrieved page, not a seller guarantee.
    offer_status: Literal['verified', 'estimated', 'unknown'] = 'unknown'


class AcquisitionError(ValueError):
    """Safe public failure; provider responses must never be exposed."""
