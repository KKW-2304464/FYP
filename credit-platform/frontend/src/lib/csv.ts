import type { ApplicationFormValues } from "../types/api";

export const CSV_HEADERS: Array<keyof ApplicationFormValues> = [
  "state", "bankState", "naicsSector", "termMonths", "noEmp", "newExist",
  "createJob", "retainedJob", "urbanRural", "revLineCr", "lowDoc",
  "grAppv", "sbaAppv", "franchiseCode"
];

export interface CsvRowError {
  row: number;
  messages: string[];
}

export interface CsvParseResult {
  rows: ApplicationFormValues[];
  errors: CsvRowError[];
  headerErrors: string[];
}

export function parseApplicationCsv(text: string): CsvParseResult {
  const matrix = parseCsv(text.replace(/^\uFEFF/, "")).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (matrix.length === 0) {
    return { rows: [], errors: [], headerErrors: ["The CSV file is empty."] };
  }

  const headers = matrix[0].map((cell) => cell.trim());
  const missing = CSV_HEADERS.filter((header) => !headers.includes(header));
  const unexpected = headers.filter((header) => !CSV_HEADERS.includes(header as keyof ApplicationFormValues));
  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
  const headerErrors = [
    ...(missing.length ? [`Missing columns: ${missing.join(", ")}.`] : []),
    ...(unexpected.length ? [`Unexpected columns: ${unexpected.join(", ")}.`] : []),
    ...(duplicates.length ? [`Duplicate columns: ${[...new Set(duplicates)].join(", ")}.`] : [])
  ];
  if (headerErrors.length > 0) {
    return { rows: [], errors: [], headerErrors };
  }

  const rows: ApplicationFormValues[] = [];
  const errors: CsvRowError[] = [];
  matrix.slice(1, 101).forEach((cells, index) => {
    const rowNumber = index + 2;
    const record = Object.fromEntries(headers.map((header, column) => [header, (cells[column] ?? "").trim()]));
    const messages = validateRecord(record);
    if (messages.length > 0) {
      errors.push({ row: rowNumber, messages });
      return;
    }
    rows.push(toApplication(record));
  });
  if (matrix.length - 1 > 100) {
    headerErrors.push("A maximum of 100 applications is allowed per upload.");
  }
  return { rows, errors, headerErrors };
}

export function downloadCsvTemplate() {
  const example = ["CA", "CA", "44", "84", "8", "Existing", "1", "8", "1", "N", "N", "150000", "90000", "0"];
  downloadText("sba-application-template.csv", `${CSV_HEADERS.join(",")}\r\n${example.join(",")}\r\n`);
}

export function downloadBatchResults(
  results: Array<{ row: number; status: string; id?: string; probability?: number | null; message?: string }>
) {
  const lines = ["row,status,applicationId,defaultProbability,message"];
  results.forEach((result) => {
    lines.push([
      result.row,
      result.status,
      result.id ?? "",
      result.probability == null ? "" : result.probability,
      csvEscape(result.message ?? "")
    ].join(","));
  });
  downloadText("batch-assessment-results.csv", `${lines.join("\r\n")}\r\n`);
}

function validateRecord(record: Record<string, string>) {
  const errors: string[] = [];
  if (!/^[A-Za-z]{2}$/.test(record.state)) errors.push("state must be a two-letter code");
  if (!/^[A-Za-z]{2}$/.test(record.bankState)) errors.push("bankState must be a two-letter code");
  if (!/^\d{2}$/.test(record.naicsSector)) errors.push("naicsSector must contain exactly two digits");
  validateNumber(record, "termMonths", 1, true, errors);
  validateNumber(record, "noEmp", 0, true, errors);
  validateNumber(record, "createJob", 0, true, errors);
  validateNumber(record, "retainedJob", 0, true, errors);
  validateNumber(record, "grAppv", 0.01, false, errors);
  validateNumber(record, "sbaAppv", 0, false, errors);
  validateNumber(record, "franchiseCode", 0, true, errors);
  if (!new Set(["Existing", "New", "Unknown"]).has(record.newExist)) errors.push("newExist must be Existing, New, or Unknown");
  if (!new Set(["0", "1", "2", "Unknown"]).has(record.urbanRural)) errors.push("urbanRural must be 0, 1, 2, or Unknown");
  if (!new Set(["Y", "N", "Unknown"]).has(record.revLineCr)) errors.push("revLineCr must be Y, N, or Unknown");
  if (!new Set(["Y", "N", "Unknown"]).has(record.lowDoc)) errors.push("lowDoc must be Y, N, or Unknown");
  if (Number(record.sbaAppv) > Number(record.grAppv)) errors.push("sbaAppv cannot exceed grAppv");
  return errors;
}

function validateNumber(record: Record<string, string>, key: string, min: number, integer: boolean, errors: string[]) {
  const value = Number(record[key]);
  if (!record[key] || !Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) {
    errors.push(`${key} must be ${integer ? "an integer" : "a number"} greater than or equal to ${min}`);
  }
}

function toApplication(record: Record<string, string>): ApplicationFormValues {
  return {
    state: record.state.toUpperCase(), bankState: record.bankState.toUpperCase(), naicsSector: record.naicsSector,
    termMonths: Number(record.termMonths), noEmp: Number(record.noEmp), newExist: record.newExist,
    createJob: Number(record.createJob), retainedJob: Number(record.retainedJob), urbanRural: record.urbanRural,
    revLineCr: record.revLineCr, lowDoc: record.lowDoc, grAppv: Number(record.grAppv),
    sbaAppv: Number(record.sbaAppv), franchiseCode: Number(record.franchiseCode)
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"'; index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell); rows.push(row);
  }
  return rows;
}

function downloadText(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
