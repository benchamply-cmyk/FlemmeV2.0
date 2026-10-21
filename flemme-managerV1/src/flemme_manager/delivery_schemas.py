"""Typed, user-supplied evidence and auditable specialist deliveries."""

from datetime import date, datetime
from zoneinfo import ZoneInfo
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, StrictBool, model_validator

from flemme_manager.schemas import LabelText, RequestText, ShortText, WorkflowId
from flemme_manager.text_utils import normalized

Money = Annotated[Decimal, Field(ge=0, le=Decimal("1000000000"), decimal_places=2, allow_inf_nan=False)]
Currency = Literal["EUR", "USD", "GBP", "CHF"]
PriceBasis = Literal["total", "per_hour", "per_night", "per_person", "per_month"]
TaxBasis = Literal["included", "excluded"]
EvidenceKind = Literal["quote", "provider", "product", "travel"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Evidence(StrictModel):
    id: LabelText
    kind: EvidenceKind
    title: ShortText
    text: RequestText
    source_url: HttpUrl | None = None
    observed_on: date
    price: Money | None = None
    currency: Currency | None = None
    price_basis: PriceBasis | None = None
    tax_basis: TaxBasis | None = None
    location: LabelText | None = None
    available_on: date | None = None
    duration_months: int | None = Field(default=None, ge=1, le=120)
    upfront_payment: Money | None = None
    features: dict[LabelText, StrictBool | None] = Field(default_factory=dict, max_length=30)
    inclusions: list[ShortText] = Field(default_factory=list, max_length=20)
    exclusions: list[ShortText] = Field(default_factory=list, max_length=20)

    @model_validator(mode="before")
    @classmethod
    def distinct_feature_names(cls, value):
        if isinstance(value, dict) and isinstance(value.get("features"), dict):
            keys = [normalized(key) for key in value["features"] if isinstance(key, str)]
            if len(set(keys)) != len(keys):
                raise ValueError("Feature names must be unique after normalization")
        return value

    @model_validator(mode="after")
    def safe_source(self):
        if self.source_url and (self.source_url.username or self.source_url.password):
            raise ValueError("Source URLs must not contain credentials")
        if self.observed_on > datetime.now(ZoneInfo("Europe/Paris")).date():
            raise ValueError("Evidence cannot be dated in the future")
        return self


class Constraints(StrictModel):
    max_price: Money | None = None
    currency: Currency | None = None
    price_basis: PriceBasis | None = None
    tax_basis: TaxBasis | None = None
    location: LabelText | None = None
    available_on: date | None = None
    duration_months: int | None = Field(default=None, ge=1, le=120)
    max_upfront_payment: Money | None = None
    required_features: list[LabelText] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def comparable_budget(self):
        if self.max_price is not None and any(value is None for value in
                (self.currency, self.price_basis, self.tax_basis)):
            raise ValueError("Budget requires explicit currency, price basis and tax basis")
        if self.max_upfront_payment is not None and (self.currency is None or self.tax_basis is None):
            raise ValueError("Upfront budget requires explicit currency and tax basis")
        if len({normalized(key) for key in self.required_features}) != len(self.required_features):
            raise ValueError("Required features must be unique")
        return self


class DeliveryInput(StrictModel):
    sources: list[Evidence] = Field(min_length=1, max_length=20)
    constraints: Constraints = Field(default_factory=Constraints)

    @model_validator(mode="after")
    def unique_ids(self):
        ids = [source.id for source in self.sources]
        if len(set(ids)) != len(ids):
            raise ValueError("Evidence IDs must be unique")
        if len(self.model_dump_json()) > 200000:
            raise ValueError("Combined evidence exceeds the input limit")
        return self


class DeliveryRequest(DeliveryInput):
    approval_id: UUID | None = None
    request_id: UUID
    expected_revision: int = Field(ge=0, le=9223372036854775805)


class SearchResult(StrictModel):
    mode: Literal["provided_sources"] = "provided_sources"
    source_ids: list[str]
    excluded_ids: list[str]


class CandidateComparison(StrictModel):
    source_id: str
    within_budget: bool | None
    location_match: bool | None
    availability_match: bool | None
    duration_match: bool | None
    upfront_within_budget: bool | None
    feature_matches: dict[str, bool | None]
    meets_supplied_constraints: bool | None
    unknowns: list[str]


class PriceGroup(StrictModel):
    currency: Currency
    price_basis: PriceBasis
    tax_basis: TaxBasis
    source_ids: list[str]
    lowest_price: Money
    highest_price: Money
    spread: Money
    spread_percent_of_lowest: Decimal | None
    lowest_price_ids: list[str]


class ComparisonResult(StrictModel):
    candidates: list[CandidateComparison]
    price_groups: list[PriceGroup]
    warnings: list[str]


class QualityResult(StrictModel):
    passed: Literal[True] = True
    checks: list[str]


class DeliveryResult(StrictModel):
    workflow_id: WorkflowId
    generated_at: datetime
    agents: list[str]
    search: SearchResult
    comparison: ComparisonResult
    markdown: str
    quality: QualityResult


class DeliveryInputError(ValueError):
    """Insufficient supplied evidence for the selected workflow."""


class DeliveryQualityError(ValueError):
    """A draft failed provenance, calculation or reporting checks."""
