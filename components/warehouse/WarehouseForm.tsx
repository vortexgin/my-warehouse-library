"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { WAREHOUSE_LIST_PATH } from "@/app/warehouse/views/warehouses/paths";
import type { Warehouse } from "@/app/warehouse/models/WarehouseModel";
import { postEncrypted, putEncrypted } from "@/libraries/EncryptedFetch";
import { SelectField, TextAreaField, TextField } from "@/components/FormField";

const API_PATH = "/warehouse/api/v1/warehouses";

export function WarehouseForm({
  mode,
  uuid,
  initial,
}: {
  mode: "create" | "edit";
  uuid?: string;
  initial?: Pick<Warehouse, "code" | "name" | "address" | "status">;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }
    setError("");
    setIsPending(true);

    try {
      const formData = new FormData(event.currentTarget);
      const payload: Record<string, unknown> = {
        code: String(formData.get("code") ?? ""),
        name: String(formData.get("name") ?? ""),
        address: String(formData.get("address") ?? "").trim() || null,
        status: String(formData.get("status") ?? "active"),
      };

      const envelope =
        mode === "create"
          ? await postEncrypted<Warehouse>(API_PATH, payload)
          : await putEncrypted<Warehouse>(`${API_PATH}/${uuid}`, payload);

      if (!envelope.success) {
        setError(envelope.message || `Failed to ${mode === "create" ? "create" : "update"} warehouse.`);
        return;
      }

      router.push(WAREHOUSE_LIST_PATH);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">
          {mode === "create" ? "New warehouse" : "Edit warehouse"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {mode === "create" ? "Create warehouse." : "Update warehouse."}
        </h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Code"
              name="code"
              required
              minLength={2}
              defaultValue={initial?.code ?? ""}
              placeholder="e.g. WH-JKT-01"
              hint="Stored uppercase; unique per organization."
            />
            <TextField
              label="Name"
              name="name"
              required
              minLength={2}
              defaultValue={initial?.name ?? ""}
              placeholder="e.g. Jakarta Main"
            />
          </div>

          <TextAreaField
            label="Address"
            name="address"
            rows={3}
            defaultValue={initial?.address ?? ""}
            placeholder="Warehouse address..."
          />

          <SelectField
            label="Status"
            name="status"
            defaultValue={initial?.status ?? "active"}
            options={[
              { value: "active", label: "active" },
              { value: "inactive", label: "inactive" },
            ]}
          />

          {error ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {isPending ? "Saving..." : mode === "create" ? "Create warehouse" : "Save changes"}
            </button>
            <Link
              href={WAREHOUSE_LIST_PATH}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
