# Credit Scoring Backend — Integration Spine (Core + Scoring)

Backend for: *Web-Based Credit Scoring System for Unbanked MSMEs using Microservices and XAI*.

This repository is the **integration spine**: the two services that actually have to
talk to each other across the polyglot boundary — the **Core Service** (Spring Boot,
the business/workflow tier) and the **Scoring & XAI Service** (Python/FastAPI, the ML
tier) — plus PostgreSQL and a `docker-compose` that wires them together.

The **API Gateway** and **Auth/Identity Service** are the next increment (see
"Roadmap" below). They were intentionally deferred because the real integration risk
lives on the Core ↔ Scoring seam, and adding a security layer before that seam works
would just be more moving parts to debug.

```
            ┌─────────────────────────────────────────────┐
            │              docker-compose network          │
            │                                               │
  client ──▶│  core-service (8080)  ──HTTP/JSON──▶  scoring-service (8000)
            │   Spring Boot                          FastAPI + CatBoost + SHAP
            │   workflow state machine               /score  /model-info  /health
            │   admin decision + audit                                    │
            │        │                                                    │
            │        ▼                                                    │
            │   postgres (5432)  core_db  (loan_application + *_AUD)       │
            └─────────────────────────────────────────────┘
```

---

## What each service owns

**Core Service (Spring Boot / JVM)** — the "thick" service that earns the Java choice:
- Owns the loan **workflow state machine**: `SUBMITTED → SCORED → PENDING_REVIEW → DECIDED`, with illegal transitions rejected.
- **Synchronously orchestrates** the scoring service on submission.
- Holds the **business decision threshold** (a cost decision, separate from the model) and derives the APPROVE/REJECT **suggestion**.
- Records the **admin decision**, and **requires a reason when the admin overrides** the suggestion.
- **Audits** every change via Hibernate Envers (reproducibility + accountability).
- Stores semi-structured features + SHAP as **Postgres JSONB**.

**Scoring & XAI Service (Python / FastAPI)** — the ML tier, split out because it has a
different runtime, a compute-heavy scaling profile, and an independent model
deployment/versioning lifecycle:
- `POST /score` → `P(default)` + per-applicant **SHAP** attribution (one pass, so the explanation is always consistent with the score).
- `GET /model-info` → model version + the feature contract.
- `GET /health` → liveness + model-loaded.
- Owns **feature engineering** (so the model's feature contract lives in one place and we avoid training/serving skew).

---

## Run it

### Option A — docker-compose (the integration demo)
Requires Docker + Docker Compose.

**Prerequisite:** place your real model first — copy your `catboost.joblib` to
`scoring-service/app/artifacts/model.joblib` and generate `feature_schema.json`
(see "Use your real model" below). The build fails fast if the model is missing.

```bash
docker compose up --build
```

This builds both images (the scoring image uses whatever model is in
`app/artifacts/`), starts Postgres, and starts Core once Postgres + Scoring are healthy.

- Core API:        http://localhost:8080
- Core Swagger UI: http://localhost:8080/swagger-ui.html
- Scoring API:     http://localhost:8000
- Scoring docs:    http://localhost:8000/docs

### Option B — run services individually (local dev)

Scoring:
```bash
cd scoring-service
pip install -r requirements.txt          # use --break-system-packages on Debian/Ubuntu
python train_stub_model.py               # creates app/artifacts/model.joblib + feature_schema.json
uvicorn app.main:app --reload --port 8000
```

Core (needs a local Postgres + JDK 17 + Maven, and access to Maven Central):
```bash
cd core-service
# point it at your Postgres + the running scoring service via env vars or application.yml
mvn spring-boot:run
```

---

## The integration contract (the important part)

Core → Scoring request (`POST /score`). Field names are **snake_case on the wire**;
the Java `ScoreRequest` maps them with `@JsonProperty`, and the FastAPI
`ApplicationFeatures` schema defines them. Both sides must agree:

```json
{
  "state": "CA", "bank_state": "CA", "naics_sector": "72",
  "term_months": 120, "no_emp": 8, "new_exist": "New",
  "create_job": 5, "retained_job": 3, "urban_rural": "1",
  "rev_line_cr": "N", "low_doc": "N",
  "gr_appv": 250000, "sba_appv": 120000, "franchise_code": 0
}
```

Scoring → Core response:

```json
{
  "model_version": "stub-catboost-0.1",
  "probability": 0.6506,
  "base_value": -0.284,
  "shap": [
    { "feature": "term_years",   "value": "10",  "shap_value":  0.5574 },
    { "feature": "naics_sector", "value": "72",  "shap_value":  0.2881 },
    { "feature": "sba_guar_ratio","value": "0.48","shap_value":  0.2274 }
  ]
}
```

The Core service decides APPROVE/REJECT by comparing `probability` to its configured
`decision.threshold`. The scoring service stays decision-agnostic.

---

## End-to-end walkthrough (curl)

```bash
# 1) SME submits an application -> scored synchronously -> PENDING_REVIEW
curl -s -X POST http://localhost:8080/api/applications \
  -H 'Content-Type: application/json' \
  -d '{
        "applicantId": "sme-001",
        "state": "CA", "bankState": "CA", "naicsSector": "72",
        "termMonths": 120, "noEmp": 8, "newExist": "New",
        "createJob": 5, "retainedJob": 3, "urbanRural": "1",
        "revLineCr": "N", "lowDoc": "N",
        "grAppv": 250000, "sbaAppv": 120000, "franchiseCode": 0
      }'
# -> 201 with id, probability, suggestion ("APPROVE"/"REJECT"), and the SHAP list

# 2) Admin views the review queue
curl -s "http://localhost:8080/api/applications?status=PENDING_REVIEW"

# 3) Admin decides. If this contradicts the suggestion, a reason is REQUIRED.
APP_ID=<paste id from step 1>
curl -s -X POST http://localhost:8080/api/applications/$APP_ID/decision \
  -H 'Content-Type: application/json' \
  -d '{ "decision": "REJECTED", "reason": "Term too long for sector risk", "decidedBy": "officer-007" }'

# 4) Audit trail (Envers revisions: intake -> scored -> decided, with the override reason)
curl -s "http://localhost:8080/api/applications/$APP_ID/history"
```

Things to try that should FAIL cleanly (good for UAT):
- Submitting with `grAppv: -1` → 400 validation error.
- Deciding the same application twice → 409 (illegal state transition).
- Overriding the suggestion with no `reason` → 400.
- Stopping the scoring container, then submitting → 503 (no score, nothing half-committed).

---

## Swapping in your real model

The scoring service loads `app/artifacts/model.joblib` + `app/artifacts/feature_schema.json`.
The service reads the **feature order and which columns are categorical directly from
the CatBoost model** (`feature_names_` / `get_cat_feature_indices()`), so dropping in
your real model cannot cause an ordering mismatch. On startup it also **fails loudly**
if `features.py` cannot produce every column the model expects — turning silent
training/serving skew into a clear error.

To use your real winner instead of the stub:

1. Drop your trained `catboost.joblib` → `app/artifacts/model.joblib`.
2. Write `app/artifacts/feature_schema.json` with at least `model_version`,
   `model_type`, plus `feature_cols` / `categorical_cols` (used as a fallback if the
   model lacks names; CatBoost normally carries them).
3. **`app/features.py` is already aligned with your real pipeline.** Your
   `get_feature_setup` returns **19 feature columns** — note it keeps BOTH raw `Term`
   (months) and the derived `term_years`. `features.py` has been reconciled against your
   real `sba_common.build_xy` (verified column-for-column for a present-day applicant).
   Run `python tools/reconcile_features.py` to re-confirm after any change.
4. The Dockerfile **already** uses whatever model is in `app/artifacts/` (it no longer
   trains a stub), so once steps 1–2 are done, `docker compose up --build` uses your
   real model. `train_stub_model.py` is now optional (only for a model-less smoke test).

### The no-skew way (recommended)

Your feature engineering currently lives at the DataFrame level in `01_clean_sba.py`,
and the dtype handling in `sba_common.build_xy`. Serving re-implements that row-wise in
`features.py`, which is a permanent skew risk. The clean fix is a **single source of
truth**: extract a row-wise `featurize_one(raw: dict) -> dict` (or a vectorized
`featurize(df)`) into `sba_common.py`, and call it from BOTH `01_clean_sba.py` and the
scoring service. Then training and serving cannot drift, and you can cite "shared
feature pipeline" as a reproducibility guarantee in the write-up.

---

## Honest constraints / notes

- The scoring service in here uses a **stub CatBoost model trained on synthetic data**
  so the system runs end-to-end without your dataset. It is for integration/demo only.
- `ddl-auto: update` lets Hibernate + Envers auto-create tables for a frictionless
  demo. For production, switch to `validate` and manage schema with **Flyway**.
- Security is **not** wired in this spine. The intended RBAC (SME sees own; admin sees
  all) is documented as `@PreAuthorize` hooks and arrives with the Auth/Gateway increment.
- **Counterfactual ("how to improve") via DiCE is deferred**, not faked. It needs the
  training data + a mutable-feature whitelist (only intervenable features like guarantee
  ratio / term — never "change your industry").

---

## Roadmap (next increments)

1. **Auth/Identity Service** (Spring Boot + Spring Security): issue/validate JWT, users + roles.
2. **API Gateway** (Spring Cloud Gateway): single entry, route, validate JWT, CORS for React.
3. Wire `@PreAuthorize` RBAC into Core; derive `applicantId`/`decidedBy` from the JWT.
4. `POST /counterfactual` (DiCE) in the scoring service + mutable-feature whitelist.
5. (Optional) MLflow model registry; Flyway migrations; per-service Postgres.

---

## How this maps to the literature review (judgments to write up)

| Decision | Rationale captured in code |
|---|---|
| Microservices vs modular monolith | 3 services + gateway; scoring boundary forced by runtime/scaling/versioning |
| Spring Boot for business tier vs all-Python | Core owns workflow/RBAC/audit/threshold — not a thin proxy |
| Synchronous orchestration vs event-driven | `ScoringClient` blocking call; human step is persisted state, not events → no broker |
| Application+Decision in one service | one aggregate; splitting forces a distributed transaction (avoided) |
| PostgreSQL + JSONB vs NoSQL | relational workflow + ACID; JSONB covers SHAP; no second DB tech |
| No service discovery / no k8s | static topology; compose DNS + compose suffice at this scale |
| SHAP (local) vs threshold (business) placement | scoring returns probability+SHAP; Core owns the cost threshold |
