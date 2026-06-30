"""
schemas.py
----------
The API contract for the Scoring & XAI service.

These Pydantic models ARE the contract: FastAPI uses them to generate OpenAPI,
and the Core (Spring Boot) service's DTOs must mirror them field-for-field.
Field names use snake_case on the wire; the Java side maps with @JsonProperty.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class ApplicationFeatures(BaseModel):
    """Raw application fields as submitted by the SME (before feature engineering).

    Feature engineering (term_years, sba_guar_ratio, recession flag, ...) happens
    INSIDE this service so the model's feature contract lives in one place and we
    avoid training/serving skew.
    """

    state: str = Field(..., examples=["CA"], description="Applicant US state code")
    bank_state: str = Field(..., examples=["CA"], description="Lending bank state code")
    naics_sector: str = Field(..., examples=["44"], description="2-digit NAICS sector")
    term_months: int = Field(..., ge=1, examples=[84], description="Loan term in months")
    no_emp: int | None = Field(default=None, ge=0, examples=[12])
    new_exist: str = Field(default="Unknown", examples=["Existing"])
    create_job: int | None = Field(default=None, ge=0, examples=[3])
    retained_job: int | None = Field(default=None, ge=0, examples=[10])
    urban_rural: str = Field(default="Unknown", examples=["1"])
    rev_line_cr: str = Field(default="Unknown", examples=["N"])
    low_doc: str = Field(default="Unknown", examples=["N"])
    gr_appv: float = Field(..., ge=0, examples=[150000.0], description="Requested/approved gross amount (proxy)")
    sba_appv: float = Field(..., ge=0, examples=[120000.0], description="SBA-guaranteed amount")
    franchise_code: int = Field(default=0, ge=0, examples=[1])


class ShapContribution(BaseModel):
    feature: str
    value: str  # the (possibly missing) feature value, as a display string
    shap_value: float


class ScoreResponse(BaseModel):
    """Pure ML output: probability of default + its SHAP attribution.

    The service is decision-agnostic by design. It returns *how risky* the loan is.
    Turning the probability into an approve/reject suggestion (applying the business
    threshold / cost policy) is the Core service's responsibility, because the
    threshold is a cost decision owned by the business tier, not the model.
    """

    model_version: str
    probability: float = Field(..., ge=0, le=1, description="P(default)")
    base_value: float = Field(..., description="SHAP base (expected log-odds) value")
    shap: list[ShapContribution]


class ModelInfo(BaseModel):
    model_version: str
    model_type: str
    n_features: int
    feature_cols: list[str]
    categorical_cols: list[str]
    trained_at: str


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
