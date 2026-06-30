"""
main.py
-------
The Scoring & XAI microservice (Python / FastAPI).

Boundary rationale (for the lit review): this service is split out because it has a
different runtime (Python ML stack: catboost, shap), a different scaling profile
(compute-heavy inference), and an independent deployment/versioning lifecycle (the
model ships and rolls forward on its own cadence). That boundary holds regardless of
who builds it — it is the one cut the architecture cannot avoid.

Endpoints:
  GET  /health      liveness + whether the model is loaded
  GET  /model-info  model version, type, feature contract
  POST /score       P(default) + per-applicant SHAP attribution
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from app.model_runner import runner
from app.schemas import (
    ApplicationFeatures,
    HealthResponse,
    ModelInfo,
    ScoreResponse,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # load the model once at startup, not per request
    runner.load()
    yield


app = FastAPI(
    title="Credit Scoring & XAI Service",
    version="1.0.0",
    description="Pre-approval default-probability scoring with SHAP explanations for MSME loans.",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse, tags=["ops"])
def health() -> HealthResponse:
    return HealthResponse(status="ok", model_loaded=runner.is_loaded)


@app.get("/model-info", response_model=ModelInfo, tags=["ops"])
def model_info() -> ModelInfo:
    if not runner.is_loaded:
        raise HTTPException(status_code=503, detail="model not loaded")
    return ModelInfo(**runner.info())


@app.post("/score", response_model=ScoreResponse, tags=["scoring"])
def score(features: ApplicationFeatures) -> ScoreResponse:
    if not runner.is_loaded:
        raise HTTPException(status_code=503, detail="model not loaded")
    try:
        result = runner.score(features.model_dump())
    except Exception as exc:  # noqa: BLE001 - surface a clean 422 for bad inputs
        raise HTTPException(status_code=422, detail=f"scoring failed: {exc}") from exc
    return ScoreResponse(**result)


# TODO (next ML increment): POST /counterfactual using DiCE for "how to improve".
# DiCE needs the training data + a mutable-feature whitelist (only intervenable
# features like guarantee ratio / term — never "change your industry"), so it is
# deferred rather than stubbed with something misleading.
