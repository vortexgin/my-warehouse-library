"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { MOVEMENT_LIST_PATH } from "@/app/warehouse/views/movements/paths";
import type { Movement } from "@/app/warehouse/models/MovementModel";
import type { Warehouse } from "@/app/warehouse/models/WarehouseModel";
import type { Product } from "@/app/product/models/ProductModel";
import type { ProductVariant } from "@/app/product/models/ProductVariantModel";
import { getEncrypted, postEncrypted } from "@/libraries/EncryptedFetch";
import { SelectField, TextAreaField, TextField } from "@/components/FormField";

const API_PATH = "/warehouse/api/v1/movements";

const TYPE_OPTIONS = [
  { value: "in", label: "in — inbound" },
  { value: "out", label: "out — outbound" },
  { value: "adjust", label: "adjust — opname count (absolute)" },
  { value: "transfer", label: "transfer — paired out+in" },
];

export function MovementForm({
  initial,
}: {
  initial?: { warehouse_id?: string; product_id?: string };
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [warehouseId, setWarehouseId] = useState(initial?.warehouse_id ?? "");
  const [productId, setProductId] = useState(initial?.product_id ?? "");
  const [variantId, setVariantId] = useState("");
  const [moveType, setMoveType] = useState("in");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [warehouseResult, productResult, variantResult] = await Promise.allSettled([
          getEncrypted<Warehouse[]>(`/warehouse/api/v1/warehouses?limit=100&sortProperty=code&sortDirection=asc`),
          getEncrypted<Product[]>(`/product/api/v1/products?limit=100&sortProperty=name&sortDirection=asc`),
          getEncrypted<ProductVariant[]>(`/product/api/v1/product-variants?limit=100&sortProperty=name&sortDirection=asc`),
        ]);
        if (!active) {
          return;
        }
        let failed = false;
        if (warehouseResult.status === "fulfilled" && warehouseResult.value.success) {
          setWarehouses((warehouseResult.value.data ?? []).filter((row) => row.status !== "deleted"));
        } else {
          failed = true;
        }
        if (productResult.status === "fulfilled" && productResult.value.success) {
          setProducts((productResult.value.data ?? []).filter((row) => row.status !== "deleted"));
        } else {
          failed = true;
        }
        if (variantResult.status === "fulfilled" && variantResult.value.success) {
          setVariants((variantResult.value.data ?? []).filter((row) => row.status !== "deleted"));
        } else {
          failed = true;
        }
        if (failed) {
          setOptionsError("Some dropdowns failed to load. Selections may be incomplete.");
        }
      } catch {
        if (active) {
          setOptionsError("Failed to load options. Please try again.");
        }
      } finally {
        if (active) {
          setOptionsLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const variantItems = variants.filter((row) => !productId || row.product_id === productId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || optionsLoading) {
      return;
    }
    setError("");
    setIsPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      const qtyRaw = String(formData.get("qty") ?? "").trim();
      const payload: Record<string, unknown> = {
        warehouse_id: warehouseId || undefined,
        product_id: productId || undefined,
        variant_id: variantId || null,
        type: moveType,
        qty: qtyRaw === "" ? undefined : Number(qtyRaw),
        notes: String(formData.get("notes") ?? "").trim() || null,
      };
      if (moveType === "transfer") {
        payload.to_warehouse_id = toWarehouseId || undefined;
      }
      if (typeof payload.qty === "number" && Number.isNaN(payload.qty)) {
        setError("Qty must be a number.");
        setIsPending(false);
        return;
      }

      const envelope = await postEncrypted<Movement[]>(API_PATH, payload);
      if (!envelope.success) {
        setError(envelope.message || "Failed to create movement.");
        return;
      }
      router.push(MOVEMENT_LIST_PATH);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">New movement</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Record movement.</h1>
        <p className="mt-2 text-sm text-slate-500">
          Append-only ledger: rows are never edited — mistakes are reversed by a counter-movement.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label="Warehouse"
              name="warehouse_id"
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
              disabled={optionsLoading}
              options={warehouses.map((option) => ({ value: option.uuid, label: `${option.code} · ${option.name}` }))}
              placeholder={optionsLoading ? "Loading warehouses..." : "Select warehouse..."}
            />
            <SelectField
              label="Product"
              name="product_id"
              value={productId}
              onChange={(event) => {
                setProductId(event.target.value);
                setVariantId("");
              }}
              disabled={optionsLoading}
              options={products.map((option) => ({ value: option.uuid, label: `${option.name} · ${option.sku}` }))}
              placeholder={optionsLoading ? "Loading products..." : "Select product..."}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label="Variant (optional)"
              name="variant_id"
              value={variantId}
              onChange={(event) => setVariantId(event.target.value)}
              disabled={optionsLoading}
              options={variantItems.map((option) => ({ value: option.uuid, label: `${option.name} · ${option.sku}` }))}
              placeholder={optionsLoading ? "Loading variants..." : "— No variant —"}
            />
            <SelectField
              label="Type"
              name="type"
              value={moveType}
              onChange={(event) => setMoveType(event.target.value)}
              options={TYPE_OPTIONS}
            />
          </div>

          {moveType === "transfer" ? (
            <SelectField
              label="To warehouse"
              name="to_warehouse_id"
              value={toWarehouseId}
              onChange={(event) => setToWarehouseId(event.target.value)}
              disabled={optionsLoading}
              options={warehouses
                .filter((option) => option.uuid !== warehouseId)
                .map((option) => ({ value: option.uuid, label: `${option.code} · ${option.name}` }))}
              placeholder={optionsLoading ? "Loading warehouses..." : "Select destination..."}
              hint="A paired out+in is written under one ref_id."
            />
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label={moveType === "adjust" ? "Counted qty (absolute)" : "Qty"}
              name="qty"
              type="number"
              required
              min={0}
              step={1}
              placeholder="0"
              hint={moveType === "adjust" ? "Absolute counted quantity, not a delta." : undefined}
            />
            <TextField label="Reference" name="ref_id" placeholder="Optional batch UUID" />
          </div>

          <TextAreaField
            label={moveType === "adjust" ? "Notes (required: who counted + evidence)" : "Notes"}
            name="notes"
            required={moveType === "adjust"}
            minLength={moveType === "adjust" ? 2 : undefined}
            rows={3}
            placeholder={moveType === "adjust" ? "e.g. Aisle-03 / Budi / recount-2" : "Optional note..."}
          />

          {optionsError ? (
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {optionsError}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isPending || optionsLoading}
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {isPending ? "Saving..." : "Record movement"}
            </button>
            <Link
              href={MOVEMENT_LIST_PATH}
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
