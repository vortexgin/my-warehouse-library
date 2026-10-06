"use client";

import { useState } from "react";
import { Table, type TableColumn, type TableRow } from "@/components/Table";
import type { Movement } from "@/app/warehouse/models/MovementModel";
import type { SessionInfo } from "@/libraries/Auth";
import { getEncrypted } from "@/libraries/EncryptedFetch";

const API_PATH = "/warehouse/api/v1/movements";

const COLUMNS: TableColumn[] = [
  { key: "type", label: "Type", field: "type" },
  { key: "qty", label: "Qty", field: "qty" },
  { key: "balance_after", label: "Balance", field: "balance_after" },
  { key: "created_at", label: "Created", field: "created_at" },
];

async function fetchMovementRows(params: URLSearchParams): Promise<TableRow[]> {
  let envelope;
  try {
    envelope = await getEncrypted<Movement[]>(`${API_PATH}?${params.toString()}`);
  } catch {
    throw new Error("Something went wrong. Please try again.");
  }
  if (!envelope.success) {
    throw new Error(envelope.message || "Failed to fetch movements.");
  }
  return (envelope.data ?? []) as TableRow[];
}

const TYPE_TONE: Record<string, string> = {
  in: "bg-green-50 text-green-700 ring-green-200",
  transfer_in: "bg-green-50 text-green-700 ring-green-200",
  out: "bg-red-50 text-red-700 ring-red-200",
  transfer_out: "bg-red-50 text-red-700 ring-red-200",
  adjust: "bg-blue-50 text-blue-700 ring-blue-200",
};

function renderMovementCell(column: TableColumn, row: TableRow, value: unknown) {
  if (column.key === "type") {
    const tone = TYPE_TONE[String(value)] ?? "bg-slate-100 text-slate-600 ring-slate-200";
    return (
      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
        {String(value ?? "—")}
      </span>
    );
  }
  if (column.key === "created_at") {
    return <span className="whitespace-nowrap">{new Date(String(value)).toLocaleString()}</span>;
  }
  return undefined;
}

export function MovementTable({
  session,
  extraParams,
}: {
  session: SessionInfo;
  extraParams?: Record<string, string>;
}) {
  // Append-only ledger: no text search, no delete. Parent views pass
  // scope filters (warehouse/product) via extraParams.
  const [applied] = useState<Record<string, string>>({ ...(extraParams ?? {}) });

  return (
    <div>
      <Table
        key={JSON.stringify(applied)}
        session={session}
        columns={COLUMNS}
        actionUpdate={[]}
        actionDelete={[]}
        fetchRows={fetchMovementRows}
        basePath="/warehouse/views/movements"
        extraParams={applied}
        defaultSort={{ key: "created_at", dir: "desc" }}
        hideManage
        labelField="type"
        renderCell={renderMovementCell}
      />
    </div>
  );
}
