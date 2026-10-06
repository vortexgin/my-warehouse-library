import Joi from "joi";
import StockModelFactory, { StockModel, type Stock } from "@/app/warehouse/models/StockModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getStockSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

/**
 * Relation labels come from eager-loaded associations, not stored snapshots.
 * Related modules are optional deployments: association setup is
 * best-effort (dynamic imports), and a missing module degrades to a plain
 * row read with null relations instead of failing the lookup.
 */
async function buildRelationIncludes(): Promise<any[]> {
  try {
    const [warehouseMod, productMod, variantMod] = await Promise.all([
      import("@/app/warehouse/models/WarehouseModel"),
      import("@/app/product/models/ProductModel"),
      import("@/app/product/models/ProductVariantModel"),
    ]);
    await Promise.all([warehouseMod.default(), productMod.default(), variantMod.default()]);
    const associations = (StockModel as any).associations ?? {};
    if (!associations.warehouse) {
      StockModel.belongsTo(warehouseMod.WarehouseModel, {
        foreignKey: "warehouse_id",
        targetKey: "uuid",
        as: "warehouse",
        constraints: false,
      });
    }
    if (!associations.product) {
      StockModel.belongsTo(productMod.ProductModel, {
        foreignKey: "product_id",
        targetKey: "uuid",
        as: "product",
        constraints: false,
      });
    }
    if (!associations.variant) {
      StockModel.belongsTo(variantMod.ProductVariantModel, {
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

export class StockGetUseCase extends BaseUseCase<string, Stock | null, string> {

  private stockData?: StockModel | null;

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getStockSchema, { uuid });

    await StockModelFactory();
    this.stockData = await StockModel.findOne({
      where: { uuid: validatedUuid.uuid, deleted_at: null },
      include: await buildRelationIncludes(),
    });
    if (!this.stockData) {
      throw new NotFoundException("Stock not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<Stock | null> {
    return StockModel.toApi(this.stockData?.toJSON());
  }
}
