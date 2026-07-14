# FYP 功能升级：复制与说明

这份代码包是从原项目读取后，在另一个 `outputs` 目录建立的副本。原本的 `FYP_New` 没有被修改。

## 这次加入的功能

### 1. 真正由模型产生的 counterfactual

- 新增 Scoring Service `POST /counterfactual`。
- 使用当前已加载的 CatBoost 对每一个候选方案重新预测，不在前端硬编码「改善建议」。
- 只允许改变 `term_months`、`gr_appv`、`sba_appv`。
- 不允许把州属、行业、城乡类别、公司年龄或 franchise 身份当成「应该改变」的建议。
- 候选期限、金额与保证比例来自 SBA temporal training split 的统计 profile；当前 profile 来自 576,107 笔 training rows。
- Core Service 会把 application、允许字段、模型版本、请求和结果存进 `counterfactual_record`，每次结果都有 audit ID。
- UI 同时说明这是 model scenario，不是贷款批准保证或财务建议。

这不是 DiCE library，而是一个受约束的 training-anchored grid search。对 FYP 来说它仍是真实 counterfactual search，因为每个方案都由真实模型重新评分，而且 immutable fields 被明确禁止。以后若要采用 DiCE，可保留现在的 API 与 audit table，只替换 Python 内部 search strategy。

### 2. 固定格式 CSV batch scoring

- CSV 只接受以下固定 headers：

```text
state,bankState,naicsSector,termMonths,noEmp,newExist,createJob,retainedJob,urbanRural,revLineCr,lowDoc,grAppv,sbaAppv,franchiseCode
```

- 最多 100 rows。
- 检查缺少、重复和多余 columns。
- 检查 state、NAICS、整数、金额、enum values，以及 `sbaAppv <= grAppv`。
- 在提交前显示 preview。
- 必须填写 source reference、记录 collection time、确认 consent，并由用户人工确认资料。
- 每一行仍通过原本正式 `/api/applications` workflow 保存、评分和产生 audit trail。
- 支持导出 batch results。

没有加入 bank statement upload，因为 bank-statement features 不在 SBANational 训练资料内。把它们直接送入现有模型在方法上是不成立的。

### 3. Data provenance 和 data quality

每个新申请会保存：

- `inputSource`: `APPLICANT_FORM` 或 `CSV_UPLOAD`
- `sourceReference`
- `collectedAt`
- `consentConfirmedAt`
- `dataConfirmed`

旧 records 仍能读取，会显示成 legacy record。新申请则必须提供 provenance 和人工确认。

### 4. Model Card 与 feature dictionary

- 显示 model version、model type、dataset、train/validation/test rows。
- 显示真实 offline metrics：ROC-AUC 0.9544、PR-AUC 0.9042、Brier 0.0784。
- 明确写出这些是 historical held-out results，不是真实上线后的 repayment monitoring。
- 显示 temporal split 和完整 19-feature serving contract。
- 标记每个 feature 的来源、意义，以及是否可用于 counterfactual。
- 普通 USER 和 ADMIN 登录后都可查看 Model Card；修改后 gateway 不再把 model info 限制成 admin-only，但仍要求 JWT 登录。

## 应复制的文件

保持下面的相对路径，把本代码包内的文件复制到你自己的 `credit-platform`。

### Scoring Service

- `scoring-service/app/main.py`
- `scoring-service/app/schemas.py`
- `scoring-service/app/model_runner.py`
- `scoring-service/app/counterfactual.py`（新）
- `scoring-service/app/artifacts/feature_schema.json`
- `scoring-service/app/artifacts/counterfactual_reference.json`（新）
- `scoring-service/tools/build_counterfactual_reference.py`（新）

### Core Service

- `core-service/src/main/java/com/fyp/core/client/ScoringClient.java`
- `core-service/src/main/java/com/fyp/core/service/ApplicationService.java`
- `core-service/src/main/java/com/fyp/core/service/CounterfactualService.java`（新）
- `core-service/src/main/java/com/fyp/core/controller/CounterfactualController.java`（新）
- `core-service/src/main/java/com/fyp/core/repository/CounterfactualRecordRepository.java`（新）
- `core-service/src/main/java/com/fyp/core/domain/LoanApplication.java`
- `core-service/src/main/java/com/fyp/core/domain/InputSource.java`（新）
- `core-service/src/main/java/com/fyp/core/domain/CounterfactualRecord.java`（新）
- `core-service/src/main/java/com/fyp/core/dto/ApplicationRequest.java`
- `core-service/src/main/java/com/fyp/core/dto/ApplicationResponse.java`
- `core-service/src/main/java/com/fyp/core/dto/DataProvenanceRequest.java`（新）
- `core-service/src/main/java/com/fyp/core/dto/CounterfactualGenerateRequest.java`（新）
- `core-service/src/main/java/com/fyp/core/dto/ScoringCounterfactualRequest.java`（新）
- `core-service/src/main/java/com/fyp/core/dto/CounterfactualModelResponse.java`（新）
- `core-service/src/main/java/com/fyp/core/dto/CounterfactualAuditResponse.java`（新）
- `core-service/src/main/java/com/fyp/core/dto/ModelInfoResponse.java`

### API Gateway

- `api-gateway/src/main/java/com/fyp/gateway/security/JwtGatewayFilter.java`

### Frontend

- `frontend/src/App.tsx`
- `frontend/src/upgrades.css`（新）
- `frontend/src/types/api.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/csv.ts`（新）
- `frontend/src/components/BatchAssessment.tsx`（新）
- `frontend/src/components/CounterfactualPanel.tsx`（新）
- `frontend/src/components/ModelGovernance.tsx`（新）

不需要更改 `package.json`；新增前端功能只使用现有 React 和 lucide-react dependencies。

## 更新后重新运行 Docker

在你自己的 `credit-platform` 路径执行：

```powershell
docker compose down --remove-orphans
docker compose build --no-cache scoring-service core-service api-gateway frontend
docker compose up -d
```

不要加 `-v`，否则会删除 PostgreSQL volume。当前 Core 设置 `ddl-auto: update`，启动时会加入 provenance columns 和 `counterfactual_record` table，同时保留旧 application records。

之后打开 `http://localhost:3000`，按 `Ctrl+F5`。`npm run dev` 仍只适合 frontend development；Docker production UI 仍由 Vite build 后交给 nginx。

## 当你重新训练模型时

如果日后训练数据或 temporal split 改变，需要重新产生 reference profile：

```powershell
cd scoring-service
python tools/build_counterfactual_reference.py --data ..\..\credit_sme\data\sba_clean.parquet
```

请使用能够读取 Parquet 的同一个 `credit_sme` Python environment。不要在没有更新 profile 的情况下声称候选范围来自新训练数据。

## 已完成的检查

- Frontend: `tsc && vite build` 成功。
- Java Core: 所有 source files 已完成 Java 17 compilation。
- Python: 所有新增/修改文件通过 `py_compile`。
- Counterfactual candidate generator: 成功读取 `SBA_TRAINING_SPLIT_PROFILE` 并产生合法候选。

Vite 仍有原本约 559 kB 的 chunk-size warning，但不是 build error，不影响运行。以后可用 route-level lazy loading 优化。
