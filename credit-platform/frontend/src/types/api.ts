export type UserRole = "USER" | "ADMIN";
export type ApplicationStatus = "SUBMITTED" | "SCORED" | "PENDING_REVIEW" | "DECIDED";
export type DecisionType = "APPROVED" | "REJECTED";
export type Suggestion = "APPROVE" | "REJECT";
export type InputSource = "APPLICANT_FORM" | "CSV_UPLOAD";
export type MutableField = "term_months" | "gr_appv" | "sba_appv";

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  businessName?: string | null;
  phone?: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  user: Profile;
}

export interface ApplicationFormValues {
  state: string;
  bankState: string;
  naicsSector: string;
  termMonths: number;
  noEmp: number;
  newExist: string;
  createJob: number;
  retainedJob: number;
  urbanRural: string;
  revLineCr: string;
  lowDoc: string;
  grAppv: number;
  sbaAppv: number;
  franchiseCode: number;
}

export interface DataProvenance {
  source: InputSource;
  sourceReference?: string;
  collectedAt: string;
  consentConfirmedAt: string;
  consentGiven: boolean;
  dataConfirmed: boolean;
}

export type ApplicationSubmission = ApplicationFormValues & { provenance: DataProvenance };

export interface ShapItem {
  feature: string;
  value: string;
  shap_value?: number;
  shapValue?: number;
}

export interface ApplicationResponse {
  id: string;
  applicantId: string;
  status: ApplicationStatus;
  probability: number | null;
  suggestion: Suggestion | null;
  thresholdUsed: number | null;
  modelVersion: string | null;
  shap: ShapItem[];
  decision: DecisionType | null;
  decisionReason: string | null;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
  inputSource: InputSource | null;
  sourceReference: string | null;
  collectedAt: string | null;
  consentConfirmedAt: string | null;
  dataConfirmed: boolean;
}

export interface AuditRevision {
  revision: number;
  status: string | null;
  probability: number | null;
  suggestion: string | null;
  decision: DecisionType | null;
  decisionReason: string | null;
  decidedBy: string | null;
}

export interface AdminMetrics {
  totalApplications: number;
  pendingReview: number;
  decided: number;
  approved: number;
  rejected: number;
  averageProbability: number;
  approvalRate: number;
  overrides: number;
  overrideRate: number;
  threshold: number;
  probabilityHistogram: Record<string, number>;
  byStatus: Record<ApplicationStatus, number>;
  bySuggestion: Record<string, number>;
  recentApplications: ApplicationResponse[];
}

export interface ModelInfo {
  model_version?: string;
  modelVersion?: string;
  model_type?: string;
  modelType?: string;
  n_features?: number;
  nFeatures?: number;
  feature_cols?: string[];
  featureCols?: string[];
  categorical_cols?: string[];
  categoricalCols?: string[];
  trained_at?: string;
  trainedAt?: string;
  dataset_name?: string;
  datasetName?: string;
  training_rows?: number;
  trainingRows?: number;
  validation_rows?: number;
  validationRows?: number;
  test_rows?: number;
  testRows?: number;
  split_strategy?: string;
  splitStrategy?: string;
  offline_metrics?: OfflineMetrics;
  offlineMetrics?: OfflineMetrics;
  intended_use?: string;
  intendedUse?: string;
  limitations?: string[];
}

export interface OfflineMetrics {
  roc_auc?: number;
  rocAuc?: number;
  pr_auc?: number;
  prAuc?: number;
  brier?: number;
  validation_roc_auc?: number;
  validationRocAuc?: number;
}

export interface CounterfactualChange {
  field: MutableField;
  fromValue: number;
  toValue: number;
  percentChange: number | null;
}

export interface CounterfactualScenario {
  rank: number;
  probability: number;
  probabilityReduction: number;
  targetMet: boolean;
  changes: CounterfactualChange[];
}

export interface CounterfactualModelResult {
  modelVersion: string;
  originalProbability: number;
  targetProbability: number;
  allowedFields: MutableField[];
  referenceSource: string;
  generatedCandidates: number;
  results: CounterfactualScenario[];
  message: string;
}

export interface CounterfactualAudit {
  auditId: string;
  applicationId: string;
  generatedBy: string;
  createdAt: string;
  allowedFields: MutableField[];
  result: CounterfactualModelResult;
}