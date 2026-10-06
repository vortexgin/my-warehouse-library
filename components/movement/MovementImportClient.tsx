"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { MOVEMENT_LIST_PATH } from "@/app/warehouse/views/movements/paths";
import { postEncrypted } from "@/libraries/EncryptedFetch";

const PREVIEW_API = "/warehouse/api/v1/movements/import/preview";
const IMPORT_API = "/warehouse/api/v1/movements/import";
const CLIENT_MAX_FILE_BYTES = 2 * 1024 * 1024;
const CLIENT_MAX_ROWS = 500;

const KNOWN_HEADERS = new Set([
  "warehouse_code",
  "sku",
  "variant_sku",
  "type",
  "qty",
  "notes",
]);

type PreviewCounts = {
  valid: Array<{ index: number }>;
  unknown_warehouse: Array<{ index: number; warehouse_code?: string; sku?: string }>;
  unknown_sku: Array<{ index: number; warehouse_code?: string; sku?: string }>;
  invalid: Array<{ index: number; errors?: string }>;
};

type ImportResult = {
  created: Array<{ uuid: string }>;
  skipped: Array<{ index: number; reason: string }>;
  ref_id: string;
};

/**
 * Minimal CSV parser (quoted fields with "" escapes, commas, CRLF).
 * Client-side only: the server never sees raw CSV, it receives JSON rows.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // Ignore: \n terminates the row.
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => !(cells.length === 1 && cells[0].trim() === ""));
}

function rowsFromCsv(text: string): Record<string, unknown>[] {
  const grid = parseCsv(text);
  if (grid.length === 0) {
    throw new Error("CSV is empty.");
  }
  const headers = grid[0].map((header) => header.trim());
  const unknown = headers.filter((header) => header !== "" && !KNOWN_HEADERS.has(header));
  if (unknown.length > 0) {
    throw new Error(`Unknown CSV headers: ${unknown.join(", ")}.`);
  }
  for (const required of ["warehouse_code", "sku", "type", "qty"]) {
    if (!headers.includes(required)) {
      throw new Error(`Missing required CSV header: ${required}.`);
    }
  }
  return grid.slice(1).map((cells) => {
    const row: Record<string, unknown> = {};
    headers.forEach((header, position) => {
      if (header !== "") {
        row[header] = (cells[position] ?? "").trim();
      }
    });
    return row;
  });
}

export function MovementImportClient() {
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<PreviewCounts | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleFilePicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setPreview(null);
    setResult(null);
    setError("");
    if (!file) {
      return;
    }
    if (file.size > CLIENT_MAX_FILE_BYTES) {
      setError(`File exceeds the ${CLIENT_MAX_FILE_BYTES} byte limit (2MB).`);
      return;
    }
    try {
      const parsed = rowsFromCsv(await file.text());
      if (parsed.length === 0) {
        setError("CSV has headers but no data rows.");
        return;
      }
      if (parsed.length > CLIENT_MAX_ROWS) {
        setError(`CSV has ${parsed.length} rows; the limit is ${CLIENT_MAX_ROWS}.`);
        return;
      }
      setFileName(file.name);
      setRows(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse CSV.");
    }
  }

  async function handlePreview() {
    if (isPending) {
      return;
    }
    setError("");
    setResult(null);
    setIsPending(true);
    try {
      const envelope = await postEncrypted<PreviewCounts>(PREVIEW_API, { rows });
      if (!envelope.success) {
        throw new Error(envelope.message || "Preview failed.");
      }
      setPreview(envelope.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleImport() {
    if (isPending) {
      return;
    }
    setError("");
    setIsPending(true);
    try {
      const envelope = await postEncrypted<ImportResult>(IMPORT_API, { rows });
      if (!envelope.success) {
        throw new Error(envelope.message || "Import failed.");
      }
      setResult(envelope.data);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Bulk import</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Import balances.</h1>
        <p className="mt-2 text-sm text-slate-500">
          Upload a CSV (max 2MB, 500 rows) with headers warehouse_code, sku,
          variant_sku, type (in|adjust), qty, notes. One batch ref_id is shared
          by all created rows. Preview first — nothing is written until confirm.
        </p>

        <div className="mt-6 space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFilePicked}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
            {fileName ? (
              <span className="mt-2 block text-xs text-slate-500">
                {fileName} · {rows.length} data rows
              </span>
            ) : null}
          </label>

          {rows.length > 0 && !preview && !result ? (
            <button
              type="button"
              onClick={handlePreview}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {isPending ? "Checking..." : "Preview import"}
            </button>
          ) : null}

          {preview ? (
            <div role="status" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="font-medium text-slate-900">
                {preview.valid.length} valid · {preview.unknown_warehouse.length} unknown warehouses ·{" "}
                {preview.unknown_sku.length} unknown SKUs · {preview.invalid.length} invalid
              </p>
              {preview.invalid.length > 0 ? (
                <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-red-700">
                  {preview.invalid.map((item) => (
                    <li key={`invalid-${item.index}`}>
                      Row {item.index + 1}: {item.errors}
                    </li>
                  ))}
                </ul>
              ) : null}
              {preview.unknown_warehouse.length + preview.unknown_sku.length > 0 ? (
                <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-amber-700">
                  {[...preview.unknown_warehouse, ...preview.unknown_sku].map((item) => (
                    <li key={`unknown-${item.index}`}>
                      Row {item.index + 1} ({item.warehouse_code ?? item.sku}): unresolvable, will be skipped
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={isPending || preview.valid.length === 0}
                  className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
                >
                  {isPending ? "Importing..." : `Import ${preview.valid.length} rows`}
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  disabled={isPending}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Back
                </button>
              </div>
            </div>
          ) : null}

          {result ? (
            <div role="status" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="font-medium text-slate-900">
                {result.created.length} created · {result.skipped.length} skipped · batch {result.ref_id}
              </p>
              {result.skipped.length > 0 ? (
                <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-amber-700">
                  {result.skipped.map((item) => (
                    <li key={`skipped-${item.index}`}>
                      Row {item.index + 1}: {item.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => router.push(MOVEMENT_LIST_PATH)}
                  className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Back to movements
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRows([]);
                    setResult(null);
                    setFileName("");
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Import another file
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
