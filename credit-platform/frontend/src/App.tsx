import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ClipboardList,
  BookOpen,
  Download,
  FileText,
  FileSpreadsheet,
  Gauge,
  History,
  KeyRound,
  LogOut,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  WalletCards,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { api, creditScore, pct, shapValue } from "./lib/api";
import { BatchAssessment } from "./components/BatchAssessment";
import { CounterfactualPanel } from "./components/CounterfactualPanel";
import { ModelGovernance } from "./components/ModelGovernance";
import "./upgrades.css";
import type {
  AdminMetrics,
  ApplicationFormValues,
  ApplicationResponse,
  DataProvenance,
  DecisionType,
  ModelInfo,
  Profile,
  UserRole
} from "./types/api";

type View = "overview" | "new" | "history" | "batch" | "model" | "profile" | "admin";

const TOKEN_KEY = "fyp.credit.token";
const USER_KEY = "fyp.credit.user";
const DRAFT_KEY = "fyp.credit.application-draft";

const emptyForm: ApplicationFormValues = {
  state: "CA",
  bankState: "CA",
  naicsSector: "44",
  termMonths: 84,
  noEmp: 8,
  newExist: "Existing",
  createJob: 1,
  retainedJob: 8,
  urbanRural: "1",
  revLineCr: "N",
  lowDoc: "N",
  grAppv: 150000,
  sbaAppv: 90000,
  franchiseCode: 0
};

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<Profile | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  });
  const [view, setView] = useState<View>(user?.role === "ADMIN" ? "admin" : "overview");
  const [applications, setApplications] = useState<ApplicationResponse[]>([]);
  const [pendingApplications, setPendingApplications] = useState<ApplicationResponse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    api.me(token)
      .then((profile) => {
        setUser(profile);
        localStorage.setItem(USER_KEY, JSON.stringify(profile));
      })
      .catch(() => logout());
  }, []);

  useEffect(() => {
    if (token && user) {
      void refresh();
    }
  }, [token, user?.role]);

  const selectedApplication = useMemo(() => {
    const all = user?.role === "ADMIN" ? [...pendingApplications, ...(metrics?.recentApplications ?? [])] : applications;
    return all.find((app) => app.id === selectedId) ?? all[0] ?? null;
  }, [applications, metrics?.recentApplications, pendingApplications, selectedId, user?.role]);

  async function refresh() {
    if (!token || !user) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (user.role === "ADMIN") {
        const [metricResult, pendingResult, modelResult] = await Promise.allSettled([
          api.adminMetrics(token),
          api.listApplications(token, "PENDING_REVIEW"),
          api.modelInfo(token)
        ]);
        if (metricResult.status === "fulfilled") {
          setMetrics(metricResult.value);
        }
        if (pendingResult.status === "fulfilled") {
          setPendingApplications(pendingResult.value);
          setSelectedId((current) => current ?? pendingResult.value[0]?.id ?? null);
        }
        if (modelResult.status === "fulfilled") {
          setModelInfo(modelResult.value);
        }
        if ([metricResult, pendingResult, modelResult].some((result) => result.status === "rejected")) {
          setMessage("Some admin data could not be refreshed.");
        }
      } else {
        const list = await api.listApplications(token);
        setApplications(list);
        setSelectedId((current) => current ?? list[0]?.id ?? null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed.");
    } finally {
      setBusy(false);
    }
  }

  function onAuth(authToken: string, profile: Profile) {
    setToken(authToken);
    setUser(profile);
    localStorage.setItem(TOKEN_KEY, authToken);
    localStorage.setItem(USER_KEY, JSON.stringify(profile));
    setView(profile.role === "ADMIN" ? "admin" : "overview");
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setApplications([]);
    setPendingApplications([]);
    setSelectedId(null);
    setMetrics(null);
    setModelInfo(null);
    setView("overview");
  }

  async function submitApplication(values: ApplicationFormValues, provenance: DataProvenance) {
    if (!token) {
      return false;
    }
    setBusy(true);
    setMessage(null);
    try {
      const created = await api.submitApplication(token, { ...values, provenance });
      setApplications((current) => [created, ...current]);
      setSelectedId(created.id);
      setView("overview");
      setMessage("Application submitted and scored.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Submission failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function downloadReport(id: string) {
    if (!token) {
      return;
    }
    try {
      await api.downloadReport(token, id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Report download failed.");
    }
  }

  async function decide(id: string, decision: DecisionType, reason?: string) {
    if (!token) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.decideApplication(token, id, { decision, reason });
      await refresh();
      setMessage("Decision recorded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Decision failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!token || !user) {
    return <AuthScreen onAuth={onAuth} />;
  }

  return (
    <Shell user={user} view={view} onView={setView} onLogout={logout} onRefresh={refresh} busy={busy}>
      {message && <div className="notice">{message}</div>}
      {view === "profile" ? (
        <ProfilePanel token={token} user={user} onUser={setUser} />
      ) : view === "batch" && user.role !== "ADMIN" ? (
        <BatchAssessment token={token} onCompleted={() => void refresh()} />
      ) : view === "model" ? (
        <ModelGovernance token={token} initial={modelInfo} />
      ) : user.role === "ADMIN" ? (
        <AdminDashboard
          metrics={metrics}
          modelInfo={modelInfo}
          pendingApplications={pendingApplications}
          selectedApplication={selectedApplication}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onDecide={decide}
          onDownload={downloadReport}
        />
      ) : (
        <>
          {view === "overview" && (
            <UserOverview
              token={token}
              applications={applications}
              selectedApplication={selectedApplication}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDownload={downloadReport}
              onNew={() => setView("new")}
            />
          )}
          {view === "new" && <ApplicationForm busy={busy} onSubmit={submitApplication} />}
          {view === "history" && (
            <HistoryPanel
              applications={applications}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDownload={downloadReport}
            />
          )}
        </>
      )}
    </Shell>
  );
}

function AuthScreen({ onAuth }: { onAuth: (token: string, profile: Profile) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response =
        mode === "login"
          ? await api.login({ email, password })
          : await api.register({ email, password, fullName, businessName, phone });
      onAuth(response.token, response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-row">
          <span className="brand-mark">
            <Gauge size={24} />
          </span>
          <div>
            <h1>FYP Credit Scoring</h1>
            <p>MSME risk assessment workspace</p>
          </div>
        </div>

        <div className="segmented">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")} type="button">
            Login
          </button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")} type="button">
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
          </label>
          {mode === "register" && (
            <>
              <label>
                Full name
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
              </label>
              <label>
                Business name
                <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
              </label>
              <label>
                Phone
                <input value={phone} onChange={(event) => setPhone(event.target.value)} />
              </label>
            </>
          )}
          {error && <div className="form-error">{error}</div>}
          <button className="primary wide" type="submit" disabled={busy}>
            <ShieldCheck size={18} />
            {mode === "login" ? "Login" : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Shell({
  user,
  view,
  onView,
  onLogout,
  onRefresh,
  busy,
  children
}: {
  user: Profile;
  view: View;
  onView: (view: View) => void;
  onLogout: () => void;
  onRefresh: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  const isAdmin = user.role === "ADMIN";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row compact">
          <span className="brand-mark">
            <Gauge size={22} />
          </span>
          <div>
            <strong>FYP Credit</strong>
            <span>{isAdmin ? "Admin" : "SME"}</span>
          </div>
        </div>
        <nav>
          {isAdmin ? (
            <>
              <NavButton active={view === "admin"} icon={<BarChart3 size={18} />} label="Dashboard" onClick={() => onView("admin")} />
              <NavButton active={view === "model"} icon={<BookOpen size={18} />} label="Model card" onClick={() => onView("model")} />
            </>
          ) : (
            <>
              <NavButton active={view === "overview"} icon={<Activity size={18} />} label="Overview" onClick={() => onView("overview")} />
              <NavButton active={view === "new"} icon={<ClipboardList size={18} />} label="Application" onClick={() => onView("new")} />
              <NavButton active={view === "history"} icon={<History size={18} />} label="History" onClick={() => onView("history")} />
              <NavButton active={view === "batch"} icon={<FileSpreadsheet size={18} />} label="CSV batch" onClick={() => onView("batch")} />
              <NavButton active={view === "model"} icon={<BookOpen size={18} />} label="Model card" onClick={() => onView("model")} />
            </>
          )}
          <NavButton active={view === "profile"} icon={<UserRound size={18} />} label="Profile" onClick={() => onView("profile")} />
        </nav>
        <button className="ghost wide" onClick={onLogout} type="button">
          <LogOut size={18} />
          Logout
        </button>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <p>{user.businessName || user.fullName}</p>
            <h2>{view === "batch" ? "Validated batch intake" : view === "model" ? "Model governance" : isAdmin ? "Model and application control" : "Credit assessment"}</h2>
          </div>
          <button className="icon-button" title="Refresh" onClick={onRefresh} type="button" disabled={busy}>
            <RefreshCw size={18} className={busy ? "spin" : ""} />
          </button>
        </header>
        {children}
      </main>
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick} type="button">
      {icon}
      {label}
    </button>
  );
}

function UserOverview({
  token,
  applications,
  selectedApplication,
  selectedId,
  onSelect,
  onDownload,
  onNew
}: {
  token: string;
  applications: ApplicationResponse[];
  selectedApplication: ApplicationResponse | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDownload: (id: string) => void;
  onNew: () => void;
}) {
  const latest = applications[0] ?? null;
  const historyData = [...applications]
    .reverse()
    .filter((app) => app.probability != null)
    .map((app, index) => ({
      name: `#${index + 1}`,
      score: creditScore(app.probability),
      probability: Number(((app.probability ?? 0) * 100).toFixed(1)),
      status: app.status,
      decision: app.decision
    }));
  const thresholdScore = latest?.thresholdUsed == null ? null : creditScore(latest.thresholdUsed);

  return (
    <div className="content-grid">
      <section className="panel span-2 overview-panel">
        <div className="panel-heading panel-heading-lg">
          <div>
            <span className="eyebrow">Your credit workspace</span>
            <h3>Assessment history</h3>
            <p>{applications.length} independent assessments — each is kept as a separate decision record.</p>
          </div>
          <button className="primary" onClick={onNew} type="button">
            <ClipboardList size={18} />
            New application
          </button>
        </div>
        <div className="metric-grid">
          <Metric label="Latest score" value={latest ? creditScore(latest.probability).toString() : "N/A"} tone="blue" />
          <Metric label="Default probability" value={latest ? pct(latest.probability) : "N/A"} tone="amber" />
          <Metric label="Pending review" value={applications.filter((app) => app.status === "PENDING_REVIEW").length.toString()} tone="teal" />
          <Metric label="Decided" value={applications.filter((app) => app.status === "DECIDED").length.toString()} tone="rose" />
        </div>
        <div className="chart-box chart-card">
          <div className="chart-heading">
            <div>
              <span className="section-kicker">Score profile</span>
              <h4>Credit score by assessment</h4>
            </div>
            <span className="chart-range">300–850 scale</span>
          </div>
          {historyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={272}>
              <BarChart data={historyData} margin={{ top: 16, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="#e6e4dc" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#6a706c", fontSize: 12 }} />
                <YAxis domain={[300, 850]} axisLine={false} tickLine={false} tick={{ fill: "#6a706c", fontSize: 12 }} width={38} />
                <Tooltip
                  cursor={{ fill: "rgba(29, 86, 78, 0.06)" }}
                  contentStyle={{ borderRadius: 10, border: "1px solid #d9ded8", boxShadow: "0 12px 30px rgba(28, 42, 37, 0.12)" }}
                />
                {thresholdScore != null && (
                  <ReferenceLine
                    y={thresholdScore}
                    stroke="#c97836"
                    strokeDasharray="5 5"
                    label={{ value: "review threshold", position: "insideTopRight", fill: "#a35f29", fontSize: 11 }}
                  />
                )}
                <Bar dataKey="score" name="Credit score" radius={[8, 8, 2, 2]} maxBarSize={52}>
                  {historyData.map((entry) => (
                    <Cell key={entry.name} fill={scoreColor(entry.probability / 100)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No applications yet" />
          )}
          <p className="chart-note">
            This is a record of independent assessments, not a performance trend. The dashed line shows the review
            threshold used by the latest assessment when it is available.
          </p>
        </div>
      </section>
      <ApplicationDetails token={token} application={selectedApplication} onDownload={onDownload} />
      <section className="panel span-3">
        <ApplicationTable applications={applications} selectedId={selectedId} onSelect={onSelect} onDownload={onDownload} />
      </section>
    </div>
  );
}

function ApplicationForm({
  busy,
  onSubmit
}: {
  busy: boolean;
  onSubmit: (values: ApplicationFormValues, provenance: DataProvenance) => Promise<boolean>;
}) {
  const [values, setValues] = useState<ApplicationFormValues>(readDraft);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [sourceReference, setSourceReference] = useState("");
  const [collectedAt, setCollectedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [consentGiven, setConsentGiven] = useState(false);
  const [dataConfirmed, setDataConfirmed] = useState(false);

  function update<K extends keyof ApplicationFormValues>(key: K, value: ApplicationFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const submitted = await onSubmit(values, {
      source: "APPLICANT_FORM",
      sourceReference: sourceReference.trim() || undefined,
      collectedAt: new Date(collectedAt).toISOString(),
      consentConfirmedAt: new Date().toISOString(),
      consentGiven,
      dataConfirmed
    });
    if (submitted) {
      localStorage.removeItem(DRAFT_KEY);
    }
  }

  function saveDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    setDraftMessage("Draft saved on this device. It will not be sent for scoring.");
  }

  function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
    setValues(emptyForm);
    setDraftMessage("Draft cleared. The example values have been restored.");
  }

  return (
    <section className="panel application-panel">
      <div className="panel-heading panel-heading-lg">
        <div>
          <span className="eyebrow">New assessment</span>
          <h3>Loan Application</h3>
          <p>Provide the operating information used by the model. You can save a private local draft before submitting.</p>
        </div>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <fieldset className="form-section">
          <legend>Business profile</legend>
          <div className="form-section-grid">
            <Field label="Applicant state" value={values.state} onChange={(value) => update("state", value.toUpperCase())} />
            <Field label="Bank state" value={values.bankState} onChange={(value) => update("bankState", value.toUpperCase())} />
            <Field label="NAICS sector" value={values.naicsSector} onChange={(value) => update("naicsSector", value)} />
            <NumberField label="Employees" value={values.noEmp} min={0} onChange={(value) => update("noEmp", value)} />
            <label>
              Business age
              <select value={values.newExist} onChange={(event) => update("newExist", event.target.value)}>
                <option>Existing</option>
                <option>New</option>
                <option>Unknown</option>
              </select>
            </label>
            <label>
              Urban/rural
              <select value={values.urbanRural} onChange={(event) => update("urbanRural", event.target.value)}>
                <option value="1">Urban</option>
                <option value="2">Rural</option>
                <option value="0">Undefined</option>
                <option value="Unknown">Unknown</option>
              </select>
            </label>
          </div>
        </fieldset>
        <fieldset className="form-section provenance-section">
          <legend>Data source and confirmation</legend>
          <p className="form-section-note">Only structured SBA-compatible fields are collected. No bank statement or unstructured document is treated as trusted model input.</p>
          <div className="form-section-grid">
            <label>
              Source reference (optional)
              <input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} placeholder="e.g. applicant form 2026-07" />
            </label>
            <label>
              Data collected at
              <input type="datetime-local" value={collectedAt} onChange={(event) => setCollectedAt(event.target.value)} required />
            </label>
          </div>
          <label className="check-row"><input type="checkbox" checked={consentGiven} onChange={(event) => setConsentGiven(event.target.checked)} required /><span>I consent to these fields being used for this credit assessment.</span></label>
          <label className="check-row"><input type="checkbox" checked={dataConfirmed} onChange={(event) => setDataConfirmed(event.target.checked)} required /><span>I reviewed the entered values and confirm that they are accurate.</span></label>
        </fieldset>
        <fieldset className="form-section">
          <legend>Facility and operating information</legend>
          <div className="form-section-grid">
            <NumberField label="Term months" value={values.termMonths} min={1} onChange={(value) => update("termMonths", value)} />
            <NumberField label="Gross approved amount" value={values.grAppv} min={0} onChange={(value) => update("grAppv", value)} />
            <NumberField label="SBA approved amount" value={values.sbaAppv} min={0} onChange={(value) => update("sbaAppv", value)} />
            <NumberField label="Jobs created" value={values.createJob} min={0} onChange={(value) => update("createJob", value)} />
            <NumberField label="Jobs retained" value={values.retainedJob} min={0} onChange={(value) => update("retainedJob", value)} />
            <NumberField label="Franchise code" value={values.franchiseCode} min={0} onChange={(value) => update("franchiseCode", value)} />
            <label>
              Revolving credit
              <select value={values.revLineCr} onChange={(event) => update("revLineCr", event.target.value)}>
                <option value="N">No</option>
                <option value="Y">Yes</option>
                <option value="Unknown">Unknown</option>
              </select>
            </label>
            <label>
              Low documentation
              <select value={values.lowDoc} onChange={(event) => update("lowDoc", event.target.value)}>
                <option value="N">No</option>
                <option value="Y">Yes</option>
                <option value="Unknown">Unknown</option>
              </select>
            </label>
          </div>
        </fieldset>
        <div className="form-actions">
          <div className="draft-status" aria-live="polite">
            <span>Drafts stay in this browser only.</span>
            {draftMessage && <strong>{draftMessage}</strong>}
          </div>
          <div className="form-action-buttons">
            <button className="text-button" type="button" onClick={clearDraft}>
              Clear draft
            </button>
            <button className="ghost" type="button" onClick={saveDraft}>
              <Save size={18} />
              Save draft
            </button>
          <button className="primary" type="submit" disabled={busy || !consentGiven || !dataConfirmed}>
            <Gauge size={18} />
            Submit and score
          </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} required />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        value={Number.isFinite(value) ? value : 0}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        required
      />
    </label>
  );
}

function ApplicationDetails({
  token,
  application,
  onDownload
}: {
  token: string;
  application: ApplicationResponse | null;
  onDownload: (id: string) => void;
}) {
  if (!application) {
    return (
      <section className="panel">
        <EmptyState title="No selected application" />
      </section>
    );
  }

  return (
    <section className="panel assessment-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Assessment result</span>
          <h3>Decision-support summary</h3>
          <p>Reference {application.id.slice(0, 8)}</p>
        </div>
        <button className="icon-button" title="Download PDF" onClick={() => onDownload(application.id)} type="button">
          <Download size={18} />
        </button>
      </div>
      <div className="assessment-summary">
        <RiskGauge probability={application.probability} threshold={application.thresholdUsed} />
        <div className="assessment-copy">
          <span className="section-kicker">Model recommendation</span>
          <div className="summary-title-row">
            <strong>{application.suggestion ?? "Awaiting score"}</strong>
            <StatusBadge value={application.status} />
          </div>
          <p>{riskNarrative(application.probability, application.thresholdUsed)}</p>
          <div className="assessment-facts">
            <div>
              <span>Credit score</span>
              <strong>{application.probability == null ? "N/A" : creditScore(application.probability)}</strong>
            </div>
            <div>
              <span>Default risk</span>
              <strong>{pct(application.probability)}</strong>
            </div>
            <div>
              <span>Model</span>
              <strong>{application.modelVersion ?? "N/A"}</strong>
            </div>
          </div>
        </div>
      </div>
      <AssessmentTimeline status={application.status} />
      <div className="provenance-strip">
        <div><span>Input source</span><strong>{application.inputSource === "CSV_UPLOAD" ? "Validated CSV upload" : application.inputSource === "APPLICANT_FORM" ? "Applicant form" : "Legacy record"}</strong></div>
        <div><span>Source reference</span><strong>{application.sourceReference || "Not provided"}</strong></div>
        <div><span>Manual confirmation</span><strong>{application.dataConfirmed ? "Recorded" : "Legacy / unavailable"}</strong></div>
      </div>
      <RiskDriverChart shap={application.shap ?? []} />
      {application.probability != null && application.thresholdUsed != null && (
        <CounterfactualPanel token={token} application={application} />
      )}
      <div className="explanation-callout">
        <ShieldCheck size={18} />
        <p>
          Feature impacts explain this score only. They are not instructions to change personal or business characteristics,
          and a human reviewer remains responsible for the final lending decision.
        </p>
      </div>
      <AuditTrail token={token} applicationId={application.id} />
    </section>
  );
}

function RiskGauge({ probability, threshold }: { probability: number | null; threshold: number | null }) {
  const risk = Math.round(Math.min(Math.max(probability ?? 0, 0), 1) * 100);
  const thresholdPosition = Math.min(Math.max((threshold ?? 0) * 100, 0), 100);

  return (
    <div className="risk-gauge" role="img" aria-label={`Estimated default risk ${risk} percent`}>
      <div className="risk-gauge-number">
        <strong>{probability == null ? "N/A" : `${risk}%`}</strong>
        <span>default risk</span>
      </div>
      <div className="risk-meter" aria-hidden="true">
        <span className="risk-meter-fill" style={{ width: `${risk}%` }} />
        {threshold != null && <span className="risk-threshold" style={{ left: `${thresholdPosition}%` }} />}
      </div>
      <div className="risk-meter-labels">
        <span>Lower risk</span>
        <span>Higher risk</span>
      </div>
      {threshold != null && <span className="risk-threshold-label">Review at {pct(threshold)}</span>}
    </div>
  );
}

function AssessmentTimeline({ status }: { status: ApplicationResponse["status"] }) {
  const stages: Array<{ key: ApplicationResponse["status"]; label: string }> = [
    { key: "SUBMITTED", label: "Submitted" },
    { key: "SCORED", label: "Scored" },
    { key: "PENDING_REVIEW", label: "Human review" },
    { key: "DECIDED", label: "Final decision" }
  ];
  const activeIndex = stages.findIndex((stage) => stage.key === status);

  return (
    <div className="assessment-timeline" aria-label={`Application status: ${status}`}>
      {stages.map((stage, index) => (
        <div className={`timeline-step ${index <= activeIndex ? "complete" : ""} ${index === activeIndex ? "current" : ""}`} key={stage.key}>
          <span>{index + 1}</span>
          <strong>{stage.label}</strong>
        </div>
      ))}
    </div>
  );
}

function RiskDriverChart({ shap }: { shap: ApplicationResponse["shap"] }) {
  const drivers = [...shap].sort((a, b) => Math.abs(shapValue(b)) - Math.abs(shapValue(a))).slice(0, 6);
  const maxImpact = Math.max(...drivers.map((item) => Math.abs(shapValue(item))), 0.01);

  return (
    <div className="risk-driver-card">
      <div className="chart-heading">
        <div>
          <span className="section-kicker">Explainable AI</span>
          <h4>What moved the risk estimate</h4>
        </div>
        <div className="driver-legend" aria-label="Chart legend">
          <span><i className="legend-dot lowers" />Lowers risk</span>
          <span><i className="legend-dot raises" />Raises risk</span>
        </div>
      </div>
      {drivers.length === 0 ? (
        <EmptyState title="Explanation factors are unavailable" />
      ) : (
        <div className="risk-driver-list" role="img" aria-label="Feature contribution chart. Green bars lower estimated default risk; orange bars raise it.">
          {drivers.map((item) => {
            const impact = shapValue(item);
            const width = `${Math.max(5, (Math.abs(impact) / maxImpact) * 50)}%`;
            return (
              <div className="risk-driver-row" key={`${item.feature}-${item.value}`}>
                <div className="risk-driver-label">
                  <strong>{formatFeature(item.feature)}</strong>
                  <span>Value: {item.value}</span>
                </div>
                <div className="diverging-track" aria-hidden="true">
                  <span className="diverging-zero" />
                  <span className={`driver-bar ${impact >= 0 ? "raises" : "lowers"}`} style={{ width }} />
                </div>
                <div className={`driver-impact ${impact >= 0 ? "raises" : "lowers"}`}>
                  {impact >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                  {impact.toFixed(3)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AuditTrail({ token, applicationId }: { token: string; applicationId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<Awaited<ReturnType<typeof api.applicationHistory>>>([]);

  async function toggleAuditTrail() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (revisions.length > 0) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRevisions(await api.applicationHistory(token, applicationId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Audit history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="audit-trail">
      <button className="audit-toggle" onClick={toggleAuditTrail} type="button" aria-expanded={open}>
        <span>
          <History size={17} />
          Audit trail
        </span>
        <span>{open ? "Hide record" : "View record"}</span>
      </button>
      {open && (
        <div className="audit-body">
          {loading && <p>Loading versioned application events…</p>}
          {error && <div className="form-error">{error}</div>}
          {!loading && !error && revisions.length === 0 && <p>No versioned events are available for this application.</p>}
          {!loading && !error && revisions.length > 0 && (
            <ol className="audit-list">
              {revisions.map((revision) => (
                <li key={revision.revision}>
                  <span className="audit-dot" />
                  <div>
                    <div className="audit-event-heading">
                      <strong>Revision {revision.revision}</strong>
                      <StatusBadge value={revision.status ?? "RECORDED"} />
                    </div>
                    <p>
                      {revision.decision
                        ? `${revision.decision} recorded${revision.decidedBy ? ` by ${revision.decidedBy}` : ""}.`
                        : revision.probability == null
                          ? "Application data recorded."
                          : `Score recorded: ${pct(revision.probability)} estimated default risk.`}
                    </p>
                    {revision.decisionReason && <span className="audit-reason">Reason: {revision.decisionReason}</span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

function HistoryPanel({
  applications,
  selectedId,
  onSelect,
  onDownload
}: {
  applications: ApplicationResponse[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDownload: (id: string) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>Credit History</h3>
          <p>Scores and review outcomes over time</p>
        </div>
      </div>
      <ApplicationTable applications={applications} selectedId={selectedId} onSelect={onSelect} onDownload={onDownload} />
    </section>
  );
}

function ApplicationTable({
  applications,
  selectedId,
  onSelect,
  onDownload
}: {
  applications: ApplicationResponse[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDownload: (id: string) => void;
}) {
  if (applications.length === 0) {
    return <EmptyState title="No applications found" />;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Score</th>
            <th>Risk</th>
            <th>Suggestion</th>
            <th>Status</th>
            <th>Decision</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {applications.map((app) => (
            <tr key={app.id} className={selectedId === app.id ? "selected" : ""} onClick={() => onSelect(app.id)}>
              <td>{new Date(app.createdAt).toLocaleDateString()}</td>
              <td>{creditScore(app.probability)}</td>
              <td>{pct(app.probability)}</td>
              <td><StatusBadge value={app.suggestion ?? "UNAVAILABLE"} /></td>
              <td><StatusBadge value={app.status} /></td>
              <td><StatusBadge value={app.decision ?? "UNDECIDED"} /></td>
              <td>
                <button className="icon-button small" title="Download PDF" onClick={(event) => {
                  event.stopPropagation();
                  onDownload(app.id);
                }} type="button">
                  <FileText size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminDashboard({
  metrics,
  modelInfo,
  pendingApplications,
  selectedApplication,
  selectedId,
  onSelect,
  onDecide,
  onDownload
}: {
  metrics: AdminMetrics | null;
  modelInfo: ModelInfo | null;
  pendingApplications: ApplicationResponse[];
  selectedApplication: ApplicationResponse | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDecide: (id: string, decision: DecisionType, reason?: string) => void;
  onDownload: (id: string) => void;
}) {
  const modelVersion = modelInfo?.modelVersion ?? modelInfo?.model_version ?? "N/A";
  const featureCount = modelInfo?.nFeatures ?? modelInfo?.n_features ?? 0;
  const total = metrics?.totalApplications ?? 0;
  const decisionMix = [
    { label: "Approved", value: metrics?.approved ?? 0, tone: "approved" },
    { label: "Rejected", value: metrics?.rejected ?? 0, tone: "rejected" },
    { label: "In review", value: metrics?.pendingReview ?? 0, tone: "review" }
  ];
  const suggestedApprove = metrics?.bySuggestion?.APPROVE ?? 0;
  const suggestedReject = metrics?.bySuggestion?.REJECT ?? 0;

  return (
    <div className="content-grid">
      <section className="panel span-2 admin-overview-panel">
        <div className="panel-heading panel-heading-lg">
          <div>
            <span className="eyebrow">Portfolio overview</span>
            <h3>Decision operations</h3>
            <p>Current volumes, review demand, and transparent model context.</p>
          </div>
        </div>
        <div className="metric-grid">
          <Metric label="Applications" value={(metrics?.totalApplications ?? 0).toString()} tone="blue" />
          <Metric label="Pending review" value={(metrics?.pendingReview ?? 0).toString()} tone="amber" />
          <Metric label="Approved" value={(metrics?.approved ?? 0).toString()} tone="teal" />
          <Metric label="Rejected" value={(metrics?.rejected ?? 0).toString()} tone="rose" />
        </div>
        <div className="admin-analytics-grid">
          <section className="decision-mix-card">
            <div className="chart-heading">
              <div>
                <span className="section-kicker">Decision distribution</span>
                <h4>Portfolio status</h4>
              </div>
              <strong>{total} applications</strong>
            </div>
            <div className="decision-stack" aria-label="Decision distribution">
              {decisionMix.map((item) => (
                <span
                  className={item.tone}
                  key={item.label}
                  style={{ width: `${(item.value / Math.max(total, 1)) * 100}%` }}
                  title={`${item.label}: ${item.value}`}
                />
              ))}
            </div>
            <div className="decision-key">
              {decisionMix.map((item) => (
                <span key={item.label}><i className={item.tone} />{item.label} <strong>{item.value}</strong></span>
              ))}
            </div>
          </section>
          <section className="model-record-card">
            <span className="section-kicker">Model record</span>
            <h4>{modelVersion}</h4>
            <dl>
              <div><dt>Feature inputs</dt><dd>{featureCount}</dd></div>
              <div><dt>Average default risk</dt><dd>{pct(metrics?.averageProbability)}</dd></div>
              <div><dt>Suggested approve / reject</dt><dd>{suggestedApprove} / {suggestedReject}</dd></div>
            </dl>
          </section>
        </div>
      </section>
      <DecisionPanel application={selectedApplication} onDecide={onDecide} onDownload={onDownload} />
      <section className="panel span-3">
        <div className="panel-heading">
          <div>
            <h3>Review Queue</h3>
            <p>{pendingApplications.length} applications awaiting decision</p>
          </div>
        </div>
        <ApplicationTable applications={pendingApplications} selectedId={selectedId} onSelect={onSelect} onDownload={onDownload} />
      </section>
    </div>
  );
}

function DecisionPanel({
  application,
  onDecide,
  onDownload
}: {
  application: ApplicationResponse | null;
  onDecide: (id: string, decision: DecisionType, reason?: string) => void;
  onDownload: (id: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setReason("");
    setLocalError(null);
  }, [application?.id]);

  if (!application) {
    return (
      <section className="panel">
        <EmptyState title="No application selected" />
      </section>
    );
  }
  const selected = application;

  function decide(decision: DecisionType) {
    const suggested = selected.suggestion === "APPROVE" ? "APPROVED" : "REJECTED";
    const isOverride = suggested !== decision;
    if (isOverride && reason.trim().length === 0) {
      setLocalError("Override reason is required.");
      return;
    }
    setLocalError(null);
    onDecide(selected.id, decision, reason.trim() || undefined);
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>Decision</h3>
          <p>{application.id.slice(0, 8)}</p>
        </div>
        <button className="icon-button" title="Download PDF" onClick={() => onDownload(application.id)} type="button">
          <Download size={18} />
        </button>
      </div>
      <div className="score-display compact-score">
        <span>{creditScore(application.probability)}</span>
        <strong>{application.suggestion ?? "N/A"}</strong>
      </div>
      <div className="detail-grid">
        <span>Applicant</span>
        <strong>{application.applicantId.slice(0, 8)}</strong>
        <span>Default probability</span>
        <strong>{pct(application.probability)}</strong>
        <span>Threshold</span>
        <strong>{pct(application.thresholdUsed)}</strong>
      </div>
      <label className="full">
        Reason
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} />
      </label>
      {localError && <div className="form-error">{localError}</div>}
      <div className="decision-actions">
        <button className="approve" onClick={() => decide("APPROVED")} type="button">
          <Check size={18} />
          Approve
        </button>
        <button className="reject" onClick={() => decide("REJECTED")} type="button">
          <X size={18} />
          Reject
        </button>
      </div>
    </section>
  );
}

function ProfilePanel({ token, user, onUser }: { token: string; user: Profile; onUser: (user: Profile) => void }) {
  const [fullName, setFullName] = useState(user.fullName);
  const [businessName, setBusinessName] = useState(user.businessName ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const updated = await api.updateProfile(token, { fullName, businessName, phone });
      onUser(updated);
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
      setMessage("Profile updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profile update failed.");
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const updated = await api.changePassword(token, { currentPassword, newPassword });
      onUser(updated);
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password update failed.");
    }
  }

  return (
    <div className="content-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Profile</h3>
            <p>{user.email}</p>
          </div>
        </div>
        <form className="stack-form" onSubmit={saveProfile}>
          <label>
            Full name
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
          </label>
          <label>
            Business name
            <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
          </label>
          <label>
            Phone
            <input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <button className="primary" type="submit">
            <Save size={18} />
            Save profile
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Security</h3>
            <p>{user.role}</p>
          </div>
        </div>
        <form className="stack-form" onSubmit={savePassword}>
          <label>
            Current password
            <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" required />
          </label>
          <label>
            New password
            <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" minLength={8} required />
          </label>
          <button className="primary" type="submit">
            <KeyRound size={18} />
            Update password
          </button>
          {message && <div className="notice inline">{message}</div>}
        </form>
      </section>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "blue" | "amber" | "teal" | "rose" }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`status-badge ${badgeTone(value)}`}>{value.replace(/_/g, " ")}</span>;
}

function badgeTone(value: string) {
  if (["APPROVE", "APPROVED", "SCORED"].includes(value)) {
    return "positive";
  }
  if (["REJECT", "REJECTED"].includes(value)) {
    return "negative";
  }
  if (["PENDING_REVIEW", "UNDECIDED"].includes(value)) {
    return "attention";
  }
  return "neutral";
}

function scoreColor(probability: number) {
  if (probability >= 0.5) {
    return "#b85c42";
  }
  if (probability >= 0.3) {
    return "#c48a38";
  }
  return "#1d6b5e";
}

function riskNarrative(probability: number | null, threshold: number | null) {
  if (probability == null) {
    return "The model result is not available yet. This application remains in the workflow until it can be scored.";
  }
  if (threshold == null) {
    return `The model estimates a ${pct(probability)} default risk. A lending officer should review the full application context.`;
  }
  const position = probability <= threshold ? "below" : "above";
  return `The estimated default risk is ${pct(probability)}, ${position} the ${pct(threshold)} review threshold. This supports review; it is not an automatic lending decision.`;
}

function formatFeature(feature: string) {
  const labels: Record<string, string> = {
    term_years: "Term length",
    term_months: "Term length",
    naics_sector: "Industry sector",
    sba_guar_ratio: "SBA guarantee ratio",
    gr_appv: "Gross approved amount",
    sba_appv: "SBA approved amount",
    no_emp: "Employees",
    create_job: "Jobs created",
    retained_job: "Jobs retained",
    new_exist: "Business age",
    urban_rural: "Area type",
    rev_line_cr: "Revolving credit",
    low_doc: "Documentation level",
    franchise_code: "Franchise code",
    bank_state: "Bank state",
    state: "Applicant state"
  };
  return labels[feature] ?? feature.replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function readDraft(): ApplicationFormValues {
  try {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (!saved) {
      return emptyForm;
    }
    return { ...emptyForm, ...(JSON.parse(saved) as Partial<ApplicationFormValues>) };
  } catch {
    return emptyForm;
  }
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="empty-state">
      <WalletCards size={28} />
      <span>{title}</span>
    </div>
  );
}
