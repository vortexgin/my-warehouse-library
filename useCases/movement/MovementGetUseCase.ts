import Joi from "joi";
import MovementModelFactory, { MovementModel, type Movement } from "@/app/warehouse/models/MovementModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getMovementSchema = Joi.object({
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
    // Ledger history: resolve relations even when soft-deleted (a movement
    // records what existed at write time). No deleted_at condition here.
    return [
      { model: warehouseMod.WarehouseModel, as: "warehouse", required: false },
      { model: productMod.ProductModel, as: "product", required: false },
      { model: variantMod.ProductVariantModel, as: "variant", required: false },
    ];
  } catch {
    return [];
  }
}

export class MovementGetUseCase extends BaseUseCase<string, Movement | null, string> {

  private movementData?: MovementModel | null;

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getMovementSchema, { uuid });

    await MovementModelFactory();
    this.movementData = await MovementModel.findOne({
      where: { uuid: validatedUuid.uuid },
      include: await buildRelationIncludes(),
    });
    if (!this.movementData) {
      throw new NotFoundException("Movement not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<Movement | null> {
    const MovementModel = await MovementModelFactory();
    return MovementModel.toApi(this.movementData?.toJSON());
  }
}
