import type {
  AdminMetrics,
  ApplicationSubmission,
  ApplicationResponse,
  AuditRevision,
  AuthResponse,
  DecisionType,
  CounterfactualAudit,
  MutableField,
  ModelInfo,
  Profile
} from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      message = body.message ?? body.detail ?? message;
    } catch {
      // Keep the HTTP status message.
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const api = {
  register: (payload: {
    email: string;
    password: string;
    fullName: string;
    businessName?: string;
    phone?: string;
  }) => apiFetch<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(payload) }),

  login: (payload: { email: string; password: string }) =>
    apiFetch<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(payload) }),

  me: (token: string) => apiFetch<Profile>("/api/auth/me", {}, token),

  updateProfile: (token: string, payload: { fullName: string; businessName?: string; phone?: string }) =>
    apiFetch<Profile>("/api/auth/profile", { method: "PATCH", body: JSON.stringify(payload) }, token),

  changePassword: (token: string, payload: { currentPassword: string; newPassword: string }) =>
    apiFetch<Profile>("/api/auth/password", { method: "POST", body: JSON.stringify(payload) }, token),

  submitApplication: (token: string, payload: ApplicationSubmission) =>
    apiFetch<ApplicationResponse>("/api/applications", { method: "POST", body: JSON.stringify(payload) }, token),

  listApplications: (token: string, status?: string) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return apiFetch<ApplicationResponse[]>(`/api/applications${query}`, {}, token);
  },

  getApplication: (token: string, id: string) => apiFetch<ApplicationResponse>(`/api/applications/${id}`, {}, token),

  applicationHistory: (token: string, id: string) =>
    apiFetch<AuditRevision[]>(`/api/applications/${id}/history`, {}, token),

  decideApplication: (token: string, id: string, payload: { decision: DecisionType; reason?: string }) =>
    apiFetch<ApplicationResponse>(
      `/api/applications/${id}/decision`,
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  adminMetrics: (token: string) => apiFetch<AdminMetrics>("/api/admin/metrics", {}, token),

  modelInfo: (token: string) => apiFetch<ModelInfo>("/api/model/info", {}, token),

  generateCounterfactual: (
    token: string,
    id: string,
    payload: { allowedFields: MutableField[]; maxResults: number }
  ) => apiFetch<CounterfactualAudit>(
    `/api/applications/${id}/counterfactuals`,
    { method: "POST", body: JSON.stringify(payload) },
    token
  ),

  counterfactualHistory: (token: string, id: string) =>
    apiFetch<CounterfactualAudit[]>(`/api/applications/${id}/counterfactuals`, {}, token),

  downloadReport: async (token: string, id: string) => {
    const response = await fetch(`${API_BASE_URL}/api/reports/applications/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new ApiError(response.status, "Failed to download report.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `credit-assessment-${id}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
};

export function shapValue(item: { shap_value?: number; shapValue?: number }) {
  return item.shapValue ?? item.shap_value ?? 0;
}

export function creditScore(probability: number | null | undefined) {
  if (probability == null) {
    return 0;
  }
  return Math.round(300 + (1 - probability) * 550);
}

export function pct(value: number | null | undefined) {
  if (value == null) {
    return "N/A";
  }
  return `${(value * 100).toFixed(1)}%`;
}
