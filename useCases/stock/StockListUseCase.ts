import Joi from "joi";
import { Op, Sequelize, type WhereOptions } from "sequelize";
import StockModelFactory, { type Stock } from "@/app/warehouse/models/StockModel";
import ProductModelFactory, { ProductModel } from "@/app/product/models/ProductModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { escapeLike } from "@/libraries/String";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListStocksFilter = {
  q?: string;
  warehouse_id?: string;
  product_id?: string;
  variant_id?: string;
  low_only?: boolean | string;
};

export type ListStocksInput = {
  filter?: ListStocksFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListStocksQuery = {
  q?: string;
  warehouse_id?: string;
  product_id?: string;
  variant_id?: string;
  low_only?: boolean;
  sortProperty: string;
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
  actor: ActivityActor;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  uuid: "uuid",
  qty_on_hand: "qty_on_hand",
  created_at: "created_at",
  updated_at: "updated_at",
};

const TRUE_VALUES = new Set(["1", "true", "yes"]);

const listStocksSchema = Joi.object({
  filter: Joi.object({
    q: Joi.string().trim().allow("").optional(),
    warehouse_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
    product_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
    variant_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
    low_only: Joi.boolean().truthy("1", "true", "yes").falsy("0", "false", "no").optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("created_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export class StockListUseCase extends BaseUseCase<ListStocksInput | void, Stock[], ListStocksQuery> {
  protected async preExec(input?: ListStocksInput | void, actor?: ActivityActor): Promise<ListStocksQuery> {
    const rawFilter = (input as ListStocksInput | undefined)?.filter;
    if (rawFilter && typeof rawFilter.low_only === "string") {
      rawFilter.low_only = TRUE_VALUES.has(rawFilter.low_only.trim().toLowerCase());
    }
    const validated = await this.validate<{
      filter?: ListStocksFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listStocksSchema, input ?? {});
    const resolved = validated.filter ?? {};

    return {
      q: resolved.q?.trim() || undefined,
      warehouse_id: resolved.warehouse_id || undefined,
      product_id: resolved.product_id || undefined,
      variant_id: resolved.variant_id || undefined,
      low_only: typeof resolved.low_only === "boolean" ? resolved.low_only : undefined,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
      actor: actor ?? null,
    };
  }

  private async applyOrganizationScope(
    conditions: WhereOptions[],
    actor: ActivityActor,
  ): Promise<void> {
    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    if (typeof actorUuid !== "string") {
      return;
    }

    const organization = await UserModel.resolveOrganization(actorUuid);
    if (!organization) {
      return;
    }

    conditions.push({ organization_id: organization.uuid });
  }

  protected async execute(context: ListStocksQuery): Promise<Stock[]> {
    const StockModel = await StockModelFactory();
    const conditions: WhereOptions[] = [{ deleted_at: null }];

    if (context.warehouse_id) {
      conditions.push({ warehouse_id: context.warehouse_id });
    }

    if (context.product_id) {
      conditions.push({ product_id: context.product_id });
    }

    if (context.variant_id) {
      conditions.push({ variant_id: context.variant_id });
    }

    if (context.low_only) {
      conditions.push(
        Sequelize.where(Sequelize.literal("qty_on_hand - qty_reserved"), Op.lte, 0),
      );
    }

    if (context.q) {
      // Match product sku/name server-side via the org product map (capped).
      await ProductModelFactory();
      const products = await ProductModel.findAll({
        where: {
          deleted_at: null,
          [Op.or]: [
            { sku: { [Op.iLike]: `%${escapeLike(context.q)}%` } },
            { name: { [Op.iLike]: `%${escapeLike(context.q)}%` } },
          ],
        },
        attributes: ["uuid"],
        limit: 100,
      });
      const productIds = products.map((product) => product.uuid);
      if (productIds.length === 0) {
        return [];
      }
      conditions.push({ product_id: { [Op.in]: productIds } });
    }

    await this.applyOrganizationScope(conditions, context.actor);

    const rows = await StockModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => StockModel.toApi(row.toJSON()));
  }
}
