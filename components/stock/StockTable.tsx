"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Table, type TableColumn, type TableQuery, type TableRow } from "@/components/Table";
import { PdfActions } from "@/components/PdfActions";
import type { Stock } from "@/app/warehouse/models/StockModel";
import type { SessionInfo } from "@/libraries/Auth";
import { getEncrypted } from "@/libraries/EncryptedFetch";

const API_PATH = "/warehouse/api/v1/stocks";

const COLUMNS: TableColumn[] = [
  { key: "warehouse_id", label: "Warehouse", field: "warehouse_id", sortable: false },
  { key: "product_id", label: "Product", field: "product_id", sortable: false },
  { key: "qty_on_hand", label: "On hand", field: "qty_on_hand" },
  { key: "qty_reserved", label: "Reserved", field: "qty_reserved" },
  { key: "available", label: "Available", field: "available", sortable: false },
  { key: "updated_at", label: "Updated", field: "updated_at" },
];

async function fetchStockRows(params: URLSearchParams): Promise<TableRow[]> {
  let envelope;
  try {
    envelope = await getEncrypted<Stock[]>(`${API_PATH}?${params.toString()}`);
  } catch {
    throw new Error("Something went wrong. Please try again.");
  }
  if (!envelope.success) {
    throw new Error(envelope.message || "Failed to fetch stocks.");
  }
  return (envelope.data ?? []).map((row) => ({
    ...row,
    available: row.qty_on_hand - row.qty_reserved,
  })) as TableRow[];
}

export function StockTable({
  session,
}: {
  session: SessionInfo;
}) {
  const [draftQ, setDraftQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [activeQuery, setActiveQuery] = useState<TableQuery>({ sort: "updated_at", dir: "desc", offset: 0 });

  const exportFilter = {
    ...(applied["filter[q]"] ? { q: applied["filter[q]"] } : {}),
    ...(applied["filter[low_only]"] ? { low_only: true } : {}),
  };

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (draftQ.trim()) {
      next["filter[q]"] = draftQ.trim();
    }
    if (lowOnly) {
      next["filter[low_only]"] = "1";
    }
    setApplied(next);
  }

  function resetFilters() {
    setDraftQ("");
    setLowOnly(false);
    setApplied({});
  }

  function renderStockCell(column: TableColumn, row: TableRow, value: unknown) {
    if (column.key === "warehouse_id") {
      // Labels come from the eager-loaded embed; a null embed (missing
      // module/row) falls back to the truncated UUID.
      const embed = (row as unknown as Stock).warehouse;
      const label = embed
        ? `${embed.code} · ${embed.name}`
        : `${String(value ?? "").slice(0, 8)}…`;
      return (
        <Link href={`/warehouse/views/movements?warehouse_id=${value}`} className="font-medium text-blue-600 hover:text-blue-500">
          {label}
        </Link>
      );
    }
    if (column.key === "product_id") {
      const embed = (row as unknown as Stock).product;
      const label = embed
        ? `${embed.name} · ${embed.sku}`
        : `${String(value ?? "").slice(0, 8)}…`;
      return <span className="font-medium text-slate-900">{label}</span>;
    }
    if (column.key === "available") {
      const available = Number(value ?? 0);
      return available <= 0 ? (
        <span className="inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
          LOW · {available}
        </span>
      ) : (
        <span className="text-slate-900">{available}</span>
      );
    }
    if (column.key === "updated_at") {
      return <span className="whitespace-nowrap">{new Date(String(value)).toLocaleString()}</span>;
    }
    return undefined;
  }

  return (
    <div>
      <form onSubmit={applyFilters} className="mt-6 space-y-3">
        <div className="flex flex-row gap-3">
          <input
            type="search"
            value={draftQ}
            onChange={(event) => setDraftQ(event.target.value)}
            placeholder="Search product SKU or name..."
            aria-label="Search stocks"
            className="w-full flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <div className="flex shrink-0 gap-2">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Filter
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(event) => setLowOnly(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Low stock only (available ≤ 0)
        </label>
      </form>

      <div className="mt-4">
        <PdfActions
          endpoint="/warehouse/api/v1/stocks/pdf"
          payload={{ filter: exportFilter, sortProperty: activeQuery.sort, sortDirection: activeQuery.dir }}
        />
      </div>

      <Table
        key={JSON.stringify(applied)}
        session={session}
        columns={COLUMNS}
        actionUpdate={[]}
        actionDelete={[]}
        fetchRows={fetchStockRows}
        basePath="/warehouse/views/stocks"
        extraParams={applied}
        defaultSort={{ key: "updated_at", dir: "desc" }}
        hideManage
        labelField="warehouse_id"
        renderCell={renderStockCell}
        onQueryChange={setActiveQuery}
      />
    </div>
  );
}
