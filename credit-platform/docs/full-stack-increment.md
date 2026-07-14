# Full-Stack Increment: Auth, Gateway, Frontend

This increment completes the FYP demo system around the existing Core Service and
Scoring Service.

## Implemented scope

- Auth/Identity Service
  - User registration and login.
  - BCrypt password hashing.
  - JWT issue and validation support.
  - Profile update and password change.
  - Seeded admin account for demo: `admin@fyp.test` / `Admin123!`.
  - Own database: `auth_db`.

- API Gateway
  - Single browser-facing backend entry point on port `8088`.
  - Routes `/api/auth/**` to Auth Service.
  - Routes `/api/applications/**`, `/api/reports/**`, `/api/admin/**`, `/api/model/**` to Core Service.
  - Validates JWT and forwards trusted identity headers:
    - `X-User-Id`
    - `X-User-Email`
    - `X-User-Role`
  - Enforces admin-only access for admin metrics, model info, and decision endpoints.

- Core Service extensions
  - Uses gateway identity for applicant ownership and admin decision actor.
  - Keeps direct-body `applicantId` / `decidedBy` compatibility for local service-only tests.
  - Adds PDF assessment report endpoint.
  - Adds admin metrics endpoint.
  - Adds model-info proxy endpoint.

- Frontend
  - React + TypeScript + Vite.
  - SME: login/register, application form, score view, SHAP bars, score trend, history, PDF download, profile/security.
  - Admin: operational metrics, model info, pending review queue, decision form with override reason handling, PDF download.

## Run

Prerequisite: place the real CatBoost artifact at:

```text
credit-backend/scoring-service/app/artifacts/model.joblib
```

Then:

```bash
cd credit-backend
docker compose up --build
```

Browser entry points:

- Frontend: `http://localhost:3000`
- API Gateway: `http://localhost:8088`
- PostgreSQL for DBeaver: `localhost:5432`

Databases:

- `core_db` for loan workflow and audit.
- `auth_db` for identity/profile.

## Requirement judgement

Kept:

- Register/login.
- Structured application form.
- ML scoring through the existing Scoring Service.
- XAI explanation through SHAP feature contribution bars.
- Historical scores and trend line.
- PDF report download.
- Profile/contact/security update.
- Admin dashboard and application decision management.

Improved:

- `applicantId` is no longer trusted from the browser when using the gateway. It is derived from the JWT subject.
- `decidedBy` is no longer trusted from the browser when using the gateway. It is derived from the JWT email.
- "Model performance" is represented as operational monitoring in this increment: application volume, decisions, average risk, model version, and feature count. True model performance needs repayment/default outcomes, which the current dataset/application workflow does not collect yet.

Deferred:

- True post-loan model performance monitoring: needs repayment labels, default events, or repayment schedules.
- Counterfactual recommendations: should use DiCE or a similar method with a mutable-feature whitelist.
- Production secret management: the compose JWT secret is a local demo secret.
- Service hardening: in production, Core/Auth/Scoring should not expose host ports directly; the gateway should be the only public API.

## Frontend framework judgement

React + Vite + TypeScript is used because this is an authenticated dashboard and workflow application, not an SEO-heavy public website. The UI is stateful: forms, role-based navigation, application selection, charts, SHAP explanations, and admin decisions all benefit from a component-based model. Vite keeps local development and static production builds simple, while TypeScript reduces DTO mismatch between the frontend and the microservice APIs.

Alternatives considered:

- Next.js: stronger when SSR/SEO and full-stack routing matter; unnecessary here because the app is private and API-backed.
- Angular: complete enterprise framework, but heavier for this FYP scope.
- Vue: viable, but React has broader dashboard/chart/form ecosystem familiarity and aligns well with a componentized admin/SME workspace.

## Market references

Comparable systems are not identical to this FYP, but they validate the problem space:

- Tala: AI-native credit infrastructure for thin-file borrowers in informal economies.
- Credolab: alternative-data credit scoring using device/behavioural metadata with API-style integration.
- Flowcast: AI credit decisioning for small business underwriting, including feature contribution style UI examples.

This FYP is intentionally narrower: it is an explainable web-based academic prototype around MSME credit assessment, not a full lender, bureau, KYC provider, or repayment platform.
