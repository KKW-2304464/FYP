import { AlertTriangle, BookOpen, Database, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { ModelInfo } from "../types/api";

const FEATURES = [
  ["State", "Applicant form", "Applicant location", "No"], ["BankState", "Applicant/bank", "Lending bank location", "No"],
  ["Term", "Applicant/lender", "Loan term in months", "Yes"], ["NoEmp", "Applicant", "Current employee count", "No"],
  ["NewExist", "Applicant", "New or existing business", "No"], ["CreateJob", "Business plan", "Planned jobs created", "Scenario only"],
  ["RetainedJob", "Business plan", "Jobs expected to be retained", "Scenario only"], ["UrbanRural", "Applicant form", "Historical SBA location category", "No"],
  ["RevLineCr", "Loan product", "Revolving credit indicator", "No"], ["LowDoc", "Loan product", "Low-documentation indicator", "No"],
  ["GrAppv", "Applicant/lender", "Gross amount; proxy for requested amount", "Yes"], ["SBA_Appv", "Lender/SBA", "SBA-guaranteed amount", "Yes, controlled"],
  ["naics_sector", "Derived", "Two-digit sector derived from NAICS", "No"], ["sba_guar_ratio", "Derived", "SBA_Appv divided by GrAppv", "Derived"],
  ["zero_appv_flag", "Derived", "Flags a zero gross amount", "Derived"], ["term_years", "Derived", "Term divided by 12", "Derived"],
  ["is_franchise", "Derived", "FranchiseCode greater than 1", "No"], ["same_state_bank", "Derived", "Applicant and bank state match", "No"],
  ["recession_0709", "Derived", "Historical 2007–09 overlap; always No for new cases", "No"]
];

export function ModelGovernance({ token, initial }: { token: string; initial?: ModelInfo | null }) {
  const [info, setInfo] = useState<ModelInfo | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!info) api.modelInfo(token).then(setInfo).catch((reason) => setError(reason instanceof Error ? reason.message : "Model information unavailable")); }, [info, token]);
  const metrics = info?.offlineMetrics ?? info?.offline_metrics;
  const values = useMemo(() => ({
    version: info?.modelVersion ?? info?.model_version ?? "—", type: info?.modelType ?? info?.model_type ?? "—",
    dataset: info?.datasetName ?? info?.dataset_name ?? "—", train: info?.trainingRows ?? info?.training_rows,
    validation: info?.validationRows ?? info?.validation_rows, test: info?.testRows ?? info?.test_rows,
    split: info?.splitStrategy ?? info?.split_strategy, intended: info?.intendedUse ?? info?.intended_use
  }), [info]);
  const metric = (camel: keyof NonNullable<typeof metrics>, snake: keyof NonNullable<typeof metrics>) => metrics?.[camel] ?? metrics?.[snake];

  return (
    <div className="governance-layout">
      <section className="panel span-3 governance-hero"><div><span className="eyebrow">Model card</span><h3>What this model can—and cannot—claim</h3><p>{values.intended}</p></div><ShieldCheck size={34} /></section>
      {error && <div className="notice span-3">{error}</div>}
      <section className="panel model-facts"><span className="section-kicker">Registered artifact</span><h4>{values.version}</h4><dl><div><dt>Estimator</dt><dd>{values.type}</dd></div><div><dt>Dataset</dt><dd>{values.dataset}</dd></div><div><dt>Training rows</dt><dd>{values.train?.toLocaleString() ?? "—"}</dd></div><div><dt>Validation rows</dt><dd>{values.validation?.toLocaleString() ?? "—"}</dd></div><div><dt>Test rows</dt><dd>{values.test?.toLocaleString() ?? "—"}</dd></div></dl></section>
      <section className="panel offline-metrics"><span className="section-kicker">Offline historical test</span><h4>Evaluation metrics</h4><div className="governance-metrics"><div><strong>{fmt(metric("rocAuc", "roc_auc"))}</strong><span>ROC-AUC</span></div><div><strong>{fmt(metric("prAuc", "pr_auc"))}</strong><span>PR-AUC</span></div><div><strong>{fmt(metric("brier", "brier"))}</strong><span>Brier ↓</span></div></div><p><AlertTriangle size={16} /> These are held-out historical results. They are not live repayment monitoring.</p></section>
      <section className="panel split-card"><Database size={22} /><span className="section-kicker">Leakage-aware validation</span><h4>Temporal split</h4><p>{values.split}</p><small>Later loans are reserved for validation/test instead of using a random-only split.</small></section>
      <section className="panel span-3 feature-dictionary"><div className="chart-heading"><div><span className="section-kicker">Data dictionary</span><h4>Exact 19-feature serving contract</h4></div><BookOpen size={20} /></div><div className="table-scroll"><table><thead><tr><th>Model feature</th><th>Source</th><th>Meaning</th><th>Counterfactual status</th></tr></thead><tbody>{FEATURES.map(([name, source, meaning, mutable]) => <tr key={name}><td><strong>{name}</strong></td><td>{source}</td><td>{meaning}</td><td>{mutable}</td></tr>)}</tbody></table></div></section>
      <section className="panel span-3 limitations"><span className="section-kicker">Declared limitations</span><ul>{(info?.limitations ?? []).map((item) => <li key={item}>{item}</li>)}</ul></section>
    </div>
  );
}

function fmt(value?: number) { return value == null ? "—" : value.toFixed(4); }
