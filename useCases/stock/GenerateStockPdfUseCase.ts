import Joi from "joi";
import { Op, Sequelize, type WhereOptions } from "sequelize";
import StockModelFactory, { StockModel, type Stock } from "@/app/warehouse/models/StockModel";
import ProductModelFactory, { ProductModel } from "@/app/product/models/ProductModel";
import type { ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import { escapeLike } from "@/libraries/String";
import { pdfRequestSchema, type ValidatedPdfRequest } from "@/libraries/google/PdfRequest";
import { activePdfTemplate, resolvePdfActor } from "@/libraries/google/PdfGeneration";
import { generateGoogleDocsPdf, type GeneratedPdf } from "@/libraries/google/GoogleDocsPdfGenerator";
import { PdfError } from "@/libraries/google/PdfError";
import { stockPdfParameters } from "@/app/warehouse/libraries/pdf/stockPdfParameters";

const SORT = { uuid: "uuid", qty_on_hand: "qty_on_hand", qty_reserved: "qty_reserved", created_at: "created_at", updated_at: "updated_at" } as const;
const schema = pdfRequestSchema.concat(Joi.object({
  filter: Joi.object({ q: Joi.string().trim().allow("").optional(), warehouse_id: Joi.string().uuid({ version: "uuidv4" }).optional(), product_id: Joi.string().uuid({ version: "uuidv4" }).optional(), variant_id: Joi.string().uuid({ version: "uuidv4" }).optional(), low_only: Joi.boolean().truthy("1", "true", "yes").falsy("0", "false", "no").optional() }).default({}),
  sortProperty: Joi.string().valid(...Object.keys(SORT)).default("created_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
}).unknown(false));
type Input = ValidatedPdfRequest & { filter?: { q?: string; warehouse_id?: string; product_id?: string; variant_id?: string; low_only?: boolean }; sortProperty?: string; sortDirection?: string };
type Context = { input: ValidatedPdfRequest & { filter: NonNullable<Input["filter"]>; sortProperty: keyof typeof SORT; sortDirection: "ASC" | "DESC" }; actorInfo: Awaited<ReturnType<typeof resolvePdfActor>> };

async function includes(): Promise<any[]> {
  try {
    const [warehouseMod, productMod, variantMod] = await Promise.all([import("@/app/warehouse/models/WarehouseModel"), import("@/app/product/models/ProductModel"), import("@/app/product/models/ProductVariantModel")]);
    await Promise.all([warehouseMod.default(), productMod.default(), variantMod.default()]);
    const associations = (StockModel as any).associations ?? {};
    if (!associations.warehouse) StockModel.belongsTo(warehouseMod.WarehouseModel, { foreignKey: "warehouse_id", targetKey: "uuid", as: "warehouse", constraints: false });
    if (!associations.product) StockModel.belongsTo(productMod.ProductModel, { foreignKey: "product_id", targetKey: "uuid", as: "product", constraints: false });
    if (!associations.variant) StockModel.belongsTo(variantMod.ProductVariantModel, { foreignKey: "variant_id", targetKey: "uuid", as: "variant", constraints: false });
    return [{ model: warehouseMod.WarehouseModel, as: "warehouse", required: false }, { model: productMod.ProductModel, as: "product", required: false }, { model: variantMod.ProductVariantModel, as: "variant", required: false }];
  } catch { return []; }
}

export class GenerateStockPdfUseCase extends BaseUseCase<Input, GeneratedPdf, Context> {
  protected async preExec(input: Input, actor?: ActivityActor): Promise<Context> {
    const value = await this.validate<any>(schema, input ?? {});
    return { input: { ...value, filter: value.filter ?? {}, sortProperty: value.sortProperty, sortDirection: value.sortDirection.toUpperCase() }, actorInfo: await resolvePdfActor(actor ?? null) };
  }
  protected async execute(context: Context): Promise<GeneratedPdf> {
    const conditions: WhereOptions[] = [{ deleted_at: null }, { organization_id: context.actorInfo.organizationId }];
    const filter = context.input.filter;
    if (filter.warehouse_id) conditions.push({ warehouse_id: filter.warehouse_id });
    if (filter.product_id) conditions.push({ product_id: filter.product_id });
    if (filter.variant_id) conditions.push({ variant_id: filter.variant_id });
    if (filter.low_only) conditions.push(Sequelize.where(Sequelize.literal("qty_on_hand - qty_reserved"), Op.lte, 0));
    if (filter.q) {
      await ProductModelFactory();
      const products = await ProductModel.findAll({ where: { deleted_at: null, [Op.or]: [{ sku: { [Op.iLike]: `%${escapeLike(filter.q)}%` } }, { name: { [Op.iLike]: `%${escapeLike(filter.q)}%` } }] }, attributes: ["uuid"] });
      conditions.push({ product_id: { [Op.in]: products.map((row) => row.uuid) } });
    }
    const max = Math.max(1, Number(process.env.PDF_STOCK_MAX_ROWS ?? 1000) || 1000);
    await StockModelFactory();
    const models = await StockModel.findAll({ where: { [Op.and]: conditions }, include: await includes(), order: [[SORT[context.input.sortProperty], context.input.sortDirection], ["uuid", "ASC"]], limit: max + 1 });
    if (models.length > max) throw new PdfError(`Stock report exceeds the configured ${max}-row limit.`, 413);
    const rows: Stock[] = models.map((row) => StockModel.toApi(row.toJSON()));
    const template = await activePdfTemplate("stock_report", context.actorInfo.organizationId);
    return generateGoogleDocsPdf({ templateId: template.google_doc_id, documentType: "stock_report", parameters: stockPdfParameters(rows, filter, { ...context.input, actorName: context.actorInfo.actorName, organizationId: context.actorInfo.organizationId, organizationName: context.actorInfo.organizationName }), filenameBase: `stock-report-${new Date().toISOString().slice(0, 10)}`, output: context.input.output });
  }
}
