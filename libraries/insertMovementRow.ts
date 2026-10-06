import { randomUUID } from "crypto";
import { UniqueConstraintError } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";
import StockModelFactory, { StockModel } from "@/app/warehouse/models/StockModel";
import MovementModelFactory, { MovementModel, type Movement, type MovementType } from "@/app/warehouse/models/MovementModel";
import ProductBomModelFactory, { ProductBomModel } from "@/app/product/models/ProductBomModel";
import BadParameterException from "@/exceptions/BadParameterException";
import UnprocessableEntityException from "@/exceptions/UnprocessableEntityException";

export type MovementWriteType = "in" | "out" | "adjust" | "transfer";

export type MovementWriteInput = {
  warehouse_id: string;
  product_id: string;
  variant_id?: string | null;
  type: MovementWriteType;
  /** in/out/transfer: delta qty. adjust: ABSOLUTE counted qty. */
  qty: number;
  ref_type?: string | null;
  ref_id?: string | null;
  notes?: string | null;
  /** transfer destination. Required iff type === "transfer". */
  to_warehouse_id?: string | null;
};

type Leg = {
  warehouse_id: string;
  type: Extract<MovementType, "in" | "out" | "adjust" | "transfer_in" | "transfer_out">;
  qty: number;
  ref_type: string | null;
  ref_id: string | null;
  notes: string | null;
};

async function getLockedStock(
  scope: { organization_id: string | null; warehouse_id: string; product_id: string; variant_id: string | null },
  transaction: any,
): Promise<StockModel> {
  await StockModelFactory();
  const found = await StockModel.findOne({
    where: { ...scope, deleted_at: null },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (found) {
    return found;
  }

  try {
    return await StockModel.create(
      {
        uuid: randomUUID(),
        ...scope,
        qty_on_hand: 0,
        qty_reserved: 0,
        status: "active",
        deleted_at: null,
      },
      { transaction },
    );
  } catch (error) {
    // Lost a concurrent first-write race: re-read under lock.
    if (error instanceof UniqueConstraintError) {
      const retry = await StockModel.findOne({
        where: { ...scope, deleted_at: null },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (retry) {
        return retry;
      }
    }
    throw error;
  }
}

/**
 * Components consumed by an `out` movement. Variant-specific rows win when
 * present; otherwise the generic (variant-less) rows apply. Single level —
 * components are never exploded recursively. Quantities scale with parent qty.
 */
async function resolveBomComponents(
  productId: string,
  variantId: string | null,
  parentQty: number,
  organizationId: string | null,
  transaction?: any,
): Promise<Array<{ product_id: string; variant_id: string | null; qty: number }>> {
  await ProductBomModelFactory();
  const rows = await ProductBomModel.findAll({
    where: {
      product_id: productId,
      organization_id: organizationId,
      status: "active",
      deleted_at: null,
    },
    ...(transaction ? { transaction } : {}),
  });

  const specific = rows.filter((row) => variantId !== null && row.variant_id === variantId);
  const applicable = specific.length > 0 ? specific : rows.filter((row) => row.variant_id === null);

  return applicable.map((row) => ({
    product_id: row.component_product_id,
    variant_id: row.component_variant_id,
    qty: row.qty * parentQty,
  }));
}

type ResolvedLeg = Leg & {
  product_id: string;
  variant_id: string | null;
};

/**
 * Single writer for stock quantities. Applies one logical movement
 * (transfer expands to an out+in leg pair sharing one ref_id; an `out`
 * movement explodes the product BoM into component `out` legs) inside a
 * single DB transaction with row locks, then returns the created rows.
 * `adjust.qty` is the absolute counted quantity, stored as-is with
 * `balance_after` set to the count. Shortage anywhere aborts everything.
 */
export async function insertMovementRow(
  input: MovementWriteInput,
  organizationId: string | null,
): Promise<Movement[]> {
  const variantId = input.variant_id ?? null;
  const notes = input.notes?.trim() || null;

  let legs: Leg[];
  if (input.type === "transfer") {
    if (!input.to_warehouse_id) {
      throw new BadParameterException("Transfer requires to_warehouse_id.");
    }
    if (input.to_warehouse_id === input.warehouse_id) {
      throw new BadParameterException("Transfer source and destination must differ.");
    }
    const refId = input.ref_id ?? randomUUID();
    legs = [
      { warehouse_id: input.warehouse_id, type: "transfer_out", qty: input.qty, ref_type: "transfer", ref_id: refId, notes },
      { warehouse_id: input.to_warehouse_id, type: "transfer_in", qty: input.qty, ref_type: "transfer", ref_id: refId, notes },
    ];
  } else {
    legs = [
      {
        warehouse_id: input.warehouse_id,
        type: input.type,
        qty: input.qty,
        ref_type: input.ref_type?.trim() || null,
        ref_id: input.ref_id ?? null,
        notes,
      },
    ];
  }

  const sequelize = await getSequelizeInstance();

  // Resolve full leg set before the transaction: transfer pair + BoM
  // explosion for `out`. Component legs mirror the parent warehouse with
  // audit ref to the parent row.
  const parentUuid = randomUUID();
  const resolved: ResolvedLeg[] = legs.map((leg) => ({
    ...leg,
    product_id: input.product_id,
    variant_id: variantId,
  }));

  const [parentLeg] = resolved;
  if (input.type === "out") {
    const components = await resolveBomComponents(input.product_id, variantId, input.qty, organizationId);
    for (const component of components) {
      resolved.push({
        warehouse_id: parentLeg.warehouse_id,
        product_id: component.product_id,
        variant_id: component.variant_id,
        type: "out",
        qty: component.qty,
        ref_type: "bom",
        ref_id: parentUuid,
        notes,
      });
    }
  }

  return sequelize.transaction(async (transaction: any) => {
    await MovementModelFactory();

    // Lock every touched stock (parent first, then components), validate all
    // balances, then write all — shortage anywhere aborts everything.
    const locked = [];
    for (const leg of resolved) {
      const stock = await getLockedStock(
        {
          organization_id: organizationId,
          warehouse_id: leg.warehouse_id,
          product_id: leg.product_id,
          variant_id: leg.variant_id,
        },
        transaction,
      );
      locked.push({ leg, stock });
    }

    const planned = locked.map(({ leg, stock }) => {
      const current = stock.qty_on_hand;
      const reserved = stock.qty_reserved;
      let next: number;

      if (leg.type === "in" || leg.type === "transfer_in") {
        next = current + leg.qty;
      } else if (leg.type === "out" || leg.type === "transfer_out") {
        if (leg.qty > current - reserved) {
          throw new UnprocessableEntityException("Insufficient stock.");
        }
        next = current - leg.qty;
      } else {
        // adjust: absolute counted quantity, enforced twice (Joi + here).
        if (leg.qty < 0) {
          throw new BadParameterException("Counted quantity cannot be negative.");
        }
        next = leg.qty;
      }
      return { leg, stock, next };
    });

    const created: Movement[] = [];
    let first = true;
    for (const { leg, stock, next } of planned) {
      await stock.update({ qty_on_hand: next, updated_at: new Date() }, { transaction });
      const row = await MovementModel.create(
        {
          uuid: first ? parentUuid : randomUUID(),
          organization_id: organizationId ?? null,
          warehouse_id: leg.warehouse_id,
          product_id: leg.product_id,
          variant_id: leg.variant_id,
          type: leg.type,
          qty: leg.qty,
          balance_after: next,
          ref_type: leg.ref_type,
          ref_id: leg.ref_id,
          notes: leg.notes,
        },
        { transaction },
      );
      first = false;
      created.push(MovementModel.toApi(row.toJSON()));
    }

    return created;
  });
}
