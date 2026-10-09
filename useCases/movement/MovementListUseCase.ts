import Joi from "joi";
import { Op } from "sequelize";
import MovementModelFactory, { MovementModel, type Movement } from "@/app/warehouse/models/MovementModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListMovementsFilter = {
  warehouse_id?: string;
  product_id?: string;
  variant_id?: string;
  type?: string;
  ref_type?: string;
  ref_id?: string;
  date_from?: string;
  date_to?: string;
};

export type ListMovementsInput = {
  filter?: ListMovementsFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListMovementsQuery = {
  warehouse_id?: string;
  product_id?: string;
  variant_id?: string;
  type?: string;
  ref_type?: string;
  ref_id?: string;
  date_from?: string;
  date_to?: string;
  sortProperty: string;
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
  actor: ActivityActor;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  uuid: "uuid",
  type: "type",
  qty: "qty",
  balance_after: "balance_after",
  created_at: "created_at",
};

const listMovementsSchema = Joi.object({
  filter: Joi.object({
    warehouse_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
    product_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
    variant_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
    type: Joi.string().valid("in", "out", "adjust", "transfer_in", "transfer_out").allow("").optional(),
    ref_type: Joi.string().trim().allow("").optional(),
    ref_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
    date_from: Joi.date().iso().optional(),
    date_to: Joi.date().iso().optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("created_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

/**
 * Resolve display labels in the list query. Ledger history intentionally has
 * no deleted_at condition on these includes, so old rows retain useful labels
 * after related master data is soft-deleted.
 */
async function buildRelationIncludes(): Promise<any[]> {
  try {
    const [warehouseMod, productMod, variantMod] = await Promise.all([
      import("@/app/warehouse/models/WarehouseModel"),
      import("@/app/product/models/ProductModel"),
      import("@/app/product/models/ProductVariantModel"),
    ]);
    await Promise.all([warehouseMod.default(), productMod.default(), variantMod.default()]);
    const associations = (MovementModel as any).associations ?? {};
    if (!associations.warehouse) {
      MovementModel.belongsTo(warehouseMod.WarehouseModel, {
        foreignKey: "warehouse_id",
        targetKey: "uuid",
        as: "warehouse",
        constraints: false,
      });
    }
    if (!associations.product) {
      MovementModel.belongsTo(productMod.ProductModel, {
        foreignKey: "product_id",
        targetKey: "uuid",
        as: "product",
        constraints: false,
      });
    }
    if (!associations.variant) {
      MovementModel.belongsTo(variantMod.ProductVariantModel, {
        foreignKey: "variant_id",
        targetKey: "uuid",
        as: "variant",
        constraints: false,
      });
    }
    return [
      { model: warehouseMod.WarehouseModel, as: "warehouse", required: false },
      { model: productMod.ProductModel, as: "product", required: false },
      { model: variantMod.ProductVariantModel, as: "variant", required: false },
    ];
  } catch {
    return [];
  }
}

export class MovementListUseCase extends BaseUseCase<ListMovementsInput | void, Movement[], ListMovementsQuery> {
  protected async preExec(input?: ListMovementsInput | void, actor?: ActivityActor): Promise<ListMovementsQuery> {
    const validated = await this.validate<{
      filter?: ListMovementsFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listMovementsSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      warehouse_id: filter.warehouse_id || undefined,
      product_id: filter.product_id || undefined,
      variant_id: filter.variant_id || undefined,
      type: filter.type?.trim() || undefined,
      ref_type: filter.ref_type?.trim() || undefined,
      ref_id: filter.ref_id || undefined,
      date_from: filter.date_from,
      date_to: filter.date_to,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
      actor: actor ?? null,
    };
  }

  private async applyOrganizationScope(
    conditions: Record<string, unknown>[],
    actor: ActivityActor,
  ): Promise<void> {
    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    if (typeof actorUuid !== "string") {
      conditions.push({ organization_id: null });
      return;
    }

    const organization = await UserModel.resolveOrganization(actorUuid);
    conditions.push({ organization_id: organization?.uuid ?? null });
  }

  protected async execute(context: ListMovementsQuery): Promise<Movement[]> {
    const MovementModel = await MovementModelFactory();
    const conditions: Record<string, unknown>[] = [];

    if (context.warehouse_id) {
      conditions.push({ warehouse_id: context.warehouse_id });
    }

    if (context.product_id) {
      conditions.push({ product_id: context.product_id });
    }

    if (context.variant_id) {
      conditions.push({ variant_id: context.variant_id });
    }

    if (context.type) {
      conditions.push({ type: context.type });
    }

    if (context.ref_type) {
      conditions.push({ ref_type: context.ref_type });
    }

    if (context.ref_id) {
      conditions.push({ ref_id: context.ref_id });
    }

    if (context.date_from) {
      conditions.push({ created_at: { [Op.gte]: new Date(context.date_from) } });
    }

    if (context.date_to) {
      conditions.push({ created_at: { [Op.lte]: new Date(context.date_to) } });
    }

    await this.applyOrganizationScope(conditions, context.actor);

    const rows = await MovementModel.findAll({
      where: { [Op.and]: conditions },
      include: await buildRelationIncludes(),
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => MovementModel.toApi(row.toJSON()));
  }
}
