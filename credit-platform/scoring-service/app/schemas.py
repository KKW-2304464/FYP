"""Pydantic contracts for scoring, model governance, and counterfactual search."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class ApplicationFeatures(BaseModel):
    """Raw pre-approval fields accepted by the SBA National model."""

    state: str = Field(..., min_length=2, max_length=2, examples=["CA"])
    bank_state: str = Field(..., min_length=2, max_length=2, examples=["CA"])
    naics_sector: str = Field(..., min_length=2, max_length=2, examples=["44"])
    term_months: int = Field(..., ge=1, le=600, examples=[84])
    no_emp: int | None = Field(default=None, ge=0)
    new_exist: str = Field(default="Unknown")
    create_job: int | None = Field(default=None, ge=0)
    retained_job: int | None = Field(default=None, ge=0)
    urban_rural: str = Field(default="Unknown")
    rev_line_cr: str = Field(default="Unknown")
    low_doc: str = Field(default="Unknown")
    gr_appv: float = Field(..., gt=0, description="Requested/gross approved amount proxy")
    sba_appv: float = Field(..., ge=0, description="SBA-guaranteed amount")
    franchise_code: int = Field(default=0, ge=0)

    @field_validator("state", "bank_state")
    @classmethod
    def normalize_state(cls, value: str) -> str:
        cleaned = value.strip().upper()
        if len(cleaned) != 2 or not cleaned.isalpha():
            raise ValueError("must be a two-letter state code")
        return cleaned

    @field_validator("naics_sector")
    @classmethod
    def validate_naics_sector(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) != 2 or not cleaned.isdigit():
            raise ValueError("must be a two-digit NAICS sector")
        return cleaned

    @model_validator(mode="after")
    def validate_amounts(self):
        if self.sba_appv > self.gr_appv:
            raise ValueError("sba_appv cannot exceed gr_appv")
        return self


class ShapContribution(BaseModel):
    feature: str
    value: str
    shap_value: float


class ScoreResponse(BaseModel):
    model_version: str
    probability: float = Field(..., ge=0, le=1)
    base_value: float
    shap: list[ShapContribution]


class OfflineMetrics(BaseModel):
    roc_auc: float | None = None
    pr_auc: float | None = None
    brier: float | None = None
    validation_roc_auc: float | None = None


class ModelInfo(BaseModel):
    model_version: str
    model_type: str
    n_features: int
    feature_cols: list[str]
    categorical_cols: list[str]
    trained_at: str
    dataset_name: str | None = None
    training_rows: int | None = None
    validation_rows: int | None = None
    test_rows: int | None = None
    split_strategy: str | None = None
    offline_metrics: OfflineMetrics | None = None
    intended_use: str | None = None
    limitations: list[str] = Field(default_factory=list)


MutableField = Literal["term_months", "gr_appv", "sba_appv"]


class CounterfactualRequest(BaseModel):
    features: ApplicationFeatures
    target_probability: float = Field(..., gt=0, lt=1)
    allowed_fields: list[MutableField] = Field(..., min_length=1, max_length=3)
    max_results: int = Field(default=3, ge=1, le=5)

    @field_validator("allowed_fields")
    @classmethod
    def unique_allowed_fields(cls, values: list[MutableField]) -> list[MutableField]:
        return list(dict.fromkeys(values))


class CounterfactualChange(BaseModel):
    field: MutableField
    from_value: float
    to_value: float
    percent_change: float | None = None


class CounterfactualScenario(BaseModel):
    rank: int
    probability: float = Field(..., ge=0, le=1)
    probability_reduction: float = Field(..., ge=0)
    target_met: bool
    changes: list[CounterfactualChange]


class CounterfactualResponse(BaseModel):
    model_version: str
    original_probability: float = Field(..., ge=0, le=1)
    target_probability: float = Field(..., ge=0, le=1)
    allowed_fields: list[MutableField]
    reference_source: str
    generated_candidates: int
    results: list[CounterfactualScenario]
    message: str


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
