import { CheckCircle2, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { api, pct } from "../lib/api";
import type { ApplicationResponse, CounterfactualAudit, MutableField } from "../types/api";

const FIELD_LABELS: Record<MutableField, string> = {
  term_months: "Loan term",
  gr_appv: "Requested / gross amount",
  sba_appv: "SBA guarantee amount"
};

export function CounterfactualPanel({ token, application }: { token: string; application: ApplicationResponse }) {
  const [allowed, setAllowed] = useState<MutableField[]>(["term_months", "gr_appv", "sba_appv"]);
  const [latest, setLatest] = useState<CounterfactualAudit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLatest(null);
    setError(null);
    api.counterfactualHistory(token, application.id)
      .then((history) => setLatest(history[0] ?? null))
      .catch(() => undefined);
  }, [application.id, token]);

  function toggle(field: MutableField) {
    setAllowed((current) => current.includes(field) ? current.filter((item) => item !== field) : [...current, field]);
  }

  async function generate() {
    if (allowed.length === 0) return;
    setBusy(true); setError(null);
    try {
      setLatest(await api.generateCounterfactual(token, application.id, { allowedFields: allowed, maxResults: 3 }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to generate scenarios.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="counterfactual-card">
      <div className="chart-heading">
        <div><span className="section-kicker">Model-generated what-if</span><h4>Facility scenarios that may lower estimated risk</h4></div>
        <SlidersHorizontal size={20} />
      </div>
      <p className="counterfactual-intro">Select only fields that may genuinely be discussed. The scoring service tests training-anchored values with the same model; it never suggests changing state, industry, or business identity.</p>
      <div className="mutable-grid">
        {(Object.keys(FIELD_LABELS) as MutableField[]).map((field) => (
          <label className="mutable-option" key={field}><input type="checkbox" checked={allowed.includes(field)} onChange={() => toggle(field)} /><span><strong>{FIELD_LABELS[field]}</strong><small>{field === "sba_appv" ? "Lender/SBA-controlled; scenario only" : "Applicant/lender discussion field"}</small></span></label>
        ))}
      </div>
      <button className="ghost" type="button" disabled={busy || allowed.length === 0 || application.probability == null} onClick={() => void generate()}>
        <RefreshCw size={17} className={busy ? "spin" : ""} /> {busy ? "Testing model scenarios" : "Generate audited scenarios"}
      </button>
      {error && <div className="validation-box error">{error}</div>}
      {latest && (
        <div className="scenario-results">
          <div className="scenario-meta"><span>{latest.result.referenceSource === "SBA_TRAINING_SPLIT_PROFILE" ? "Anchored to SBA training split" : "Domain fallback used"}</span><span>Audit {latest.auditId.slice(0, 8)}</span><span>Model {latest.result.modelVersion}</span></div>
          <p>{latest.result.message}</p>
          {latest.result.results.map((scenario) => (
            <article className="scenario-card" key={scenario.rank}>
              <div className="scenario-score"><span>Scenario {scenario.rank}</span><strong>{pct(scenario.probability)}</strong><small>{pct(scenario.probabilityReduction)} lower</small></div>
              <div className="scenario-changes">
                {scenario.changes.map((change) => <div key={change.field}><strong>{FIELD_LABELS[change.field]}</strong><span>{formatValue(change.field, change.fromValue)} → {formatValue(change.field, change.toValue)}</span></div>)}
              </div>
              <span className={`threshold-chip ${scenario.targetMet ? "met" : "not-met"}`}>{scenario.targetMet && <CheckCircle2 size={14} />}{scenario.targetMet ? "Below review threshold" : "Improves risk, threshold not reached"}</span>
            </article>
          ))}
        </div>
      )}
      <div className="explanation-callout compact"><p>These are model scenarios, not financial advice or an approval guarantee. A human reviewer must assess affordability, policy, and documentation.</p></div>
    </div>
  );
}

function formatValue(field: MutableField, value: number) {
  return field === "term_months" ? `${Math.round(value)} months` : `$${Math.round(value).toLocaleString()}`;
}
