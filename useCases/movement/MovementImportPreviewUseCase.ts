import Joi from "joi";
import { Op } from "sequelize";
import WarehouseModelFactory, { WarehouseModel } from "@/app/warehouse/models/WarehouseModel";
import ProductModelFactory, { ProductModel } from "@/app/product/models/ProductModel";
import ProductVariantModelFactory, { ProductVariantModel } from "@/app/product/models/ProductVariantModel";
import { UserModel } from "@/app/base/models/UserModel";
import type { ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

/** One CSV-parsed row. Empty strings are normalized to undefined before validation. */
export type MovementImportRow = {
  warehouse_code?: string;
  sku?: string;
  variant_sku?: string | null;
  type?: string;
  qty?: number;
  notes?: string | null;
  ref_id?: string | null;
};

export const MAX_IMPORT_ROWS = 500;

export const movementImportRowSchema = Joi.object({
  warehouse_code: Joi.string().trim().min(1).max(30).required(),
  sku: Joi.string().trim().min(1).max(60).required(),
  variant_sku: Joi.string().trim().allow("", null).max(60).optional(),
  type: Joi.string().valid("in", "adjust").required(),
  qty: Joi.number().integer().min(0).required(),
  notes: Joi.when("type", {
    is: "adjust",
    then: Joi.string().trim().min(2).required(),
    otherwise: Joi.string().trim().allow("", null).optional(),
  }),
  ref_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
}).unknown(false);

export const movementImportEnvelopeSchema = Joi.object({
  rows: Joi.array().items(Joi.object().unknown(true)).min(1).max(MAX_IMPORT_ROWS).required(),
}).unknown(false);

export function normalizeMovementImportRow(raw: Record<string, unknown>): MovementImportRow {
  const row: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw ?? {})) {
    if (typeof val === "string") {
      const trimmed = val.trim();
      row[key] = trimmed === "" ? undefined : trimmed;
    } else {
      row[key] = val;
    }
  }
  return row as MovementImportRow;
}

export type ImportRowIssue = {
  index: number;
  warehouse_code?: string;
  sku?: string;
  errors?: string;
};

export type MovementImportPreview = {
  valid: Array<{
    index: number;
    row: MovementImportRow & { warehouse_code: string; sku: string; type: string; qty: number };
    warehouse_id: string;
    product_id: string;
    variant_id: string | null;
  }>;
  unknown_warehouse: ImportRowIssue[];
  unknown_sku: ImportRowIssue[];
  invalid: ImportRowIssue[];
};

type ResolvedRefs = {
  warehouses: Map<string, { uuid: string }>;
  products: Map<string, { uuid: string }>;
  variants: Map<string, Map<string, { uuid: string }>>;
};

/**
 * Shared classifier: Joi per row (errors collected), warehouse/sku/variant
 * resolution with single batched org-scoped queries. No writes, no billing.
 */
export async function classifyMovementImportRows(
  rawRows: unknown[],
  organizationId: string | null,
): Promise<MovementImportPreview> {
  const normalized = rawRows.map((raw) => normalizeMovementImportRow((raw ?? {}) as Record<string, unknown>));

  const invalid: ImportRowIssue[] = [];
  const candidates: Array<{ index: number; row: MovementImportRow & { warehouse_code: string; sku: string; type: string; qty: number } }> = [];

  normalized.forEach((row, index) => {
    const { error, value } = movementImportRowSchema.validate(row, { abortEarly: false });
    if (error) {
      invalid.push({ index, errors: error.details.map((detail) => detail.message).join(", ") });
      return;
    }
    candidates.push({ index, row: value as MovementImportRow & { warehouse_code: string; sku: string; type: string; qty: number } });
  });

  const refs = await resolveImportRefs(
    candidates.map(({ row }) => row),
    organizationId,
  );

  const unknown_warehouse: ImportRowIssue[] = [];
  const unknown_sku: ImportRowIssue[] = [];
  const valid: MovementImportPreview["valid"] = [];

  for (const { index, row } of candidates) {
    const warehouse = refs.warehouses.get(row.warehouse_code.trim().toUpperCase());
    if (!warehouse) {
      unknown_warehouse.push({ index, warehouse_code: row.warehouse_code, sku: row.sku });
      continue;
    }
    const product = refs.products.get(row.sku.trim().toUpperCase());
    if (!product) {
      unknown_sku.push({ index, warehouse_code: row.warehouse_code, sku: row.sku });
      continue;
    }
    let variantId: string | null = null;
    if (row.variant_sku?.trim()) {
      const variant = refs.variants.get(product.uuid)?.get(row.variant_sku.trim().toUpperCase());
      if (!variant) {
        invalid.push({ index, warehouse_code: row.warehouse_code, sku: row.sku, errors: "Unknown variant SKU for this product." });
        continue;
      }
      variantId = variant.uuid;
    }
    valid.push({ index, row, warehouse_id: warehouse.uuid, product_id: product.uuid, variant_id: variantId });
  }

  return { valid, unknown_warehouse, unknown_sku, invalid };
}

async function resolveImportRefs(
  rows: Array<{ warehouse_code: string; sku: string; variant_sku?: string | null }>,
  organizationId: string | null,
): Promise<ResolvedRefs> {
  const warehouses = new Map<string, { uuid: string }>();
  const products = new Map<string, { uuid: string }>();
  const variants = new Map<string, Map<string, { uuid: string }>>();

  const codes = [...new Set(rows.map((row) => row.warehouse_code.trim().toUpperCase()))];
  const skus = [...new Set(rows.map((row) => row.sku.trim().toUpperCase()))];
  const variantSkus = [...new Set(rows.map((row) => row.variant_sku?.trim().toUpperCase()).filter((sku): sku is string => typeof sku === "string" && sku !== ""))];

  if (codes.length > 0) {
    await WarehouseModelFactory();
    const found = await WarehouseModel.findAll({
      where: { organization_id: organizationId, code: { [Op.in]: codes }, deleted_at: null },
      attributes: ["uuid", "code"],
    });
    for (const row of found) {
      warehouses.set(row.code.toUpperCase(), { uuid: row.uuid });
    }
  }

  if (skus.length > 0) {
    await ProductModelFactory();
    const found = await ProductModel.findAll({
      where: { organization_id: organizationId, sku: { [Op.in]: skus }, deleted_at: null },
      attributes: ["uuid", "sku"],
    });
    for (const row of found) {
      products.set(row.sku.toUpperCase(), { uuid: row.uuid });
    }
  }

  if (variantSkus.length > 0 && products.size > 0) {
    await ProductVariantModelFactory();
    const found = await ProductVariantModel.findAll({
      where: {
        organization_id: organizationId,
        product_id: { [Op.in]: [...products.values()].map((product) => product.uuid) },
        sku: { [Op.in]: variantSkus },
        deleted_at: null,
      },
      attributes: ["uuid", "product_id", "sku"],
    });
    for (const row of found) {
      if (!variants.has(row.product_id)) {
        variants.set(row.product_id, new Map());
      }
      variants.get(row.product_id)?.set(row.sku.toUpperCase(), { uuid: row.uuid });
    }
  }

  return { warehouses, products, variants };
}

export class MovementImportPreviewUseCase extends BaseUseCase<{ rows: unknown[] }, MovementImportPreview, { rows: unknown[]; organizationId: string | null }> {
  protected async preExec(input: { rows: unknown[] }, actor?: ActivityActor): Promise<{ rows: unknown[]; organizationId: string | null }> {
    const validated = await this.validate<{ rows: unknown[] }>(
      Joi.object({ rows: Joi.array().items(Joi.object().unknown(true)).min(1).max(MAX_IMPORT_ROWS).required() }).unknown(false),
      input ?? {},
    );

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    return { rows: validated.rows, organizationId };
  }

  protected async execute(context: { rows: unknown[]; organizationId: string | null }): Promise<MovementImportPreview> {
    // Dry run: classification only, no writes, no billing.
    return classifyMovementImportRows(context.rows, context.organizationId);
  }
}
