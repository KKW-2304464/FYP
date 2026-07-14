"""FastAPI scoring, XAI, model-information, and counterfactual service."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from app.model_runner import runner
from app.schemas import (
    ApplicationFeatures,
    CounterfactualRequest,
    CounterfactualResponse,
    HealthResponse,
    ModelInfo,
    ScoreResponse,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    runner.load()
    yield


app = FastAPI(
    title="Credit Scoring & XAI Service",
    version="2.0.0",
    description="Pre-approval scoring, SHAP explanation, and constrained counterfactual scenarios.",
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
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"scoring failed: {exc}") from exc
    return ScoreResponse(**result)


@app.post("/counterfactual", response_model=CounterfactualResponse, tags=["scoring"])
def counterfactual(request: CounterfactualRequest) -> CounterfactualResponse:
    if not runner.is_loaded:
        raise HTTPException(status_code=503, detail="model not loaded")
    try:
        result = runner.counterfactual(
            request.features.model_dump(),
            request.target_probability,
            list(request.allowed_fields),
            request.max_results,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"counterfactual search failed: {exc}") from exc
    return CounterfactualResponse(**result)
