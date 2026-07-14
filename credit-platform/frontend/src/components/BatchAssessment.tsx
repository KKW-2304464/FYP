import { CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { api, pct } from "../lib/api";
import { downloadBatchResults, downloadCsvTemplate, parseApplicationCsv } from "../lib/csv";
import type { ApplicationResponse } from "../types/api";

interface BatchResult {
  row: number;
  status: "SCORED" | "FAILED";
  application?: ApplicationResponse;
  message?: string;
}

export function BatchAssessment({ token, onCompleted }: { token: string; onCompleted: () => void }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ReturnType<typeof parseApplicationCsv>["rows"]>([]);
  const [rowErrors, setRowErrors] = useState<ReturnType<typeof parseApplicationCsv>["errors"]>([]);
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [sourceReference, setSourceReference] = useState("");
  const [collectedAt, setCollectedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [consent, setConsent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<BatchResult[]>([]);

  const ready = rows.length > 0 && headerErrors.length === 0 && rowErrors.length === 0 && sourceReference.trim() && consent && confirmed;
  const summary = useMemo(() => ({
    success: results.filter((result) => result.status === "SCORED").length,
    failed: results.filter((result) => result.status === "FAILED").length
  }), [results]);

  async function selectFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setResults([]);
    const parsed = parseApplicationCsv(await file.text());
    setRows(parsed.rows);
    setRowErrors(parsed.errors);
    setHeaderErrors(parsed.headerErrors);
    if (!sourceReference) setSourceReference(file.name.replace(/\.csv$/i, ""));
  }

  async function submitBatch() {
    if (!ready) return;
    setBusy(true);
    const completed: BatchResult[] = [];
    const consentTime = new Date().toISOString();
    for (let index = 0; index < rows.length; index += 1) {
      try {
        const application = await api.submitApplication(token, {
          ...rows[index],
          provenance: {
            source: "CSV_UPLOAD",
            sourceReference: sourceReference.trim(),
            collectedAt: new Date(collectedAt).toISOString(),
            consentConfirmedAt: consentTime,
            consentGiven: true,
            dataConfirmed: true
          }
        });
        completed.push({ row: index + 2, status: "SCORED", application });
      } catch (error) {
        completed.push({ row: index + 2, status: "FAILED", message: error instanceof Error ? error.message : "Submission failed" });
      }
      setResults([...completed]);
    }
    setBusy(false);
    onCompleted();
  }

  function exportResults() {
    downloadBatchResults(results.map((result) => ({
      row: result.row,
      status: result.status,
      id: result.application?.id,
      probability: result.application?.probability,
      message: result.message
    })));
  }

  return (
    <div className="batch-layout">
      <section className="panel span-3">
        <div className="panel-heading panel-heading-lg">
          <div>
            <span className="eyebrow">Controlled data intake</span>
            <h3>CSV batch assessment</h3>
            <p>Upload the fixed SBA-compatible template. The system validates every field and asks for manual confirmation before any row is scored.</p>
          </div>
          <button className="ghost" type="button" onClick={downloadCsvTemplate}><Download size={17} /> Download template</button>
        </div>
        <div className="scope-callout">
          <strong>Why fixed format?</strong>
          <span>It prevents guessed field mapping and training-serving mismatch. Bank statements are intentionally excluded because their variables were not used to train this model.</span>
        </div>
      </section>

      <section className="panel upload-panel">
        <label className="csv-dropzone">
          <Upload size={28} />
          <strong>{fileName || "Choose a CSV file"}</strong>
          <span>Exact headers · maximum 100 rows · CSV only</span>
          <input accept=".csv,text/csv" type="file" onChange={(event) => void selectFile(event.target.files?.[0])} />
        </label>
        <div className="batch-meta-grid">
          <label>Source reference<input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} placeholder="e.g. July intake list" required /></label>
          <label>Data collected at<input type="datetime-local" value={collectedAt} onChange={(event) => setCollectedAt(event.target.value)} required /></label>
        </div>
        {(headerErrors.length > 0 || rowErrors.length > 0) && (
          <div className="validation-box error">
            <XCircle size={18} />
            <div>
              <strong>Fix these issues before scoring</strong>
              {headerErrors.map((error) => <p key={error}>{error}</p>)}
              {rowErrors.slice(0, 12).map((error) => <p key={error.row}>Row {error.row}: {error.messages.join("; ")}</p>)}
              {rowErrors.length > 12 && <p>And {rowErrors.length - 12} more invalid rows.</p>}
            </div>
          </div>
        )}
        {rows.length > 0 && headerErrors.length === 0 && rowErrors.length === 0 && (
          <div className="validation-box success"><CheckCircle2 size={18} /><strong>{rows.length} rows passed structural validation.</strong></div>
        )}
      </section>

      <section className="panel confirmation-panel">
        <span className="section-kicker">Manual verification</span>
        <h4>Confirm before scoring</h4>
        <label className="check-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I confirm that applicant consent exists for using these fields for credit assessment.</span></label>
        <label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the preview and confirm that the values and field mapping are correct.</span></label>
        <button className="primary wide" type="button" disabled={!ready || busy} onClick={() => void submitBatch()}>
          <FileSpreadsheet size={18} /> {busy ? `Scoring ${results.length + 1} of ${rows.length}` : `Score ${rows.length || 0} applications`}
        </button>
      </section>

      {rows.length > 0 && (
        <section className="panel span-3 batch-preview">
          <div className="chart-heading"><div><span className="section-kicker">Preview</span><h4>First {Math.min(rows.length, 10)} validated rows</h4></div></div>
          <div className="table-scroll"><table><thead><tr><th>Row</th><th>State</th><th>Sector</th><th>Term</th><th>Gross amount</th><th>SBA amount</th><th>Employees</th></tr></thead><tbody>
            {rows.slice(0, 10).map((row, index) => <tr key={`${row.state}-${index}`}><td>{index + 2}</td><td>{row.state}</td><td>{row.naicsSector}</td><td>{row.termMonths} mo</td><td>${row.grAppv.toLocaleString()}</td><td>${row.sbaAppv.toLocaleString()}</td><td>{row.noEmp}</td></tr>)}
          </tbody></table></div>
        </section>
      )}

      {results.length > 0 && (
        <section className="panel span-3 batch-results">
          <div className="panel-heading"><div><span className="eyebrow">Batch result</span><h3>{summary.success} scored · {summary.failed} failed</h3></div><button className="ghost" type="button" onClick={exportResults}><Download size={17} /> Export results</button></div>
          <div className="table-scroll"><table><thead><tr><th>CSV row</th><th>Status</th><th>Reference</th><th>Default risk</th><th>Message</th></tr></thead><tbody>
            {results.map((result) => <tr key={result.row}><td>{result.row}</td><td><span className={`status-badge ${result.status === "SCORED" ? "approved" : "rejected"}`}>{result.status}</span></td><td>{result.application?.id.slice(0, 8) ?? "—"}</td><td>{pct(result.application?.probability)}</td><td>{result.message ?? "Stored with CSV provenance"}</td></tr>)}
          </tbody></table></div>
        </section>
      )}
    </div>
  );
}
