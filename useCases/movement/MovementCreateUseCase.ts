import Joi from "joi";
import WarehouseModelFactory, { WarehouseModel } from "@/app/warehouse/models/WarehouseModel";
import ProductModelFactory, { ProductModel } from "@/app/product/models/ProductModel";
import ProductVariantModelFactory, { ProductVariantModel } from "@/app/product/models/ProductVariantModel";
import { insertMovementRow, type MovementWriteInput } from "@/app/warehouse/libraries/insertMovementRow";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import ForbiddenException from "@/exceptions/ForbiddenException";
import NotFoundException from "@/exceptions/NotFoundException";
import type { Movement } from "@/app/warehouse/models/MovementModel";

const createMovementSchema = Joi.object({
  warehouse_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  product_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  variant_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  // Single-leg transfer_in/out are server-generated only; clients send "transfer".
  type: Joi.string().valid("in", "out", "adjust", "transfer").required(),
  to_warehouse_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  // in/out/transfer: delta qty. adjust: ABSOLUTE counted qty.
  qty: Joi.number().integer().min(0).required(),
  ref_type: Joi.string().trim().max(60).allow("", null).optional(),
  ref_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  notes: Joi.when("type", {
    is: "adjust",
    then: Joi.string().trim().min(2).required(),
    otherwise: Joi.string().trim().allow("", null).optional(),
  }),
}).unknown(false);

export type MovementCreateContext = {
  input: MovementWriteInput;
  actor: ActivityActor;
  organizationId: string | null;
};

async function assertSameOrg(
  row: { organization_id: string | null } | null,
  organizationId: string | null,
  entity: string,
): Promise<void> {
  if (!row) {
    throw new NotFoundException(`${entity} not found.`);
  }
  if (organizationId && (row.organization_id ?? null) !== organizationId) {
    throw new ForbiddenException(`${entity} belongs to another organization.`);
  }
}

export class MovementCreateUseCase extends BaseUseCase<MovementWriteInput, Movement[], MovementCreateContext> {
  protected async preExec(input: MovementWriteInput, actor?: ActivityActor): Promise<MovementCreateContext> {
    const validated = await this.validate<MovementWriteInput>(createMovementSchema, input);

    if (validated.type === "transfer" && !validated.to_warehouse_id) {
      throw new BadParameterException("Transfer requires to_warehouse_id.");
    }
    if (validated.type !== "transfer" && validated.to_warehouse_id) {
      throw new BadParameterException("to_warehouse_id is only accepted for transfer.");
    }

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await WarehouseModelFactory();
    const warehouse = await WarehouseModel.findOne({ where: { uuid: validated.warehouse_id, deleted_at: null } });
    await assertSameOrg(warehouse, organizationId, "Warehouse");

    if (validated.type === "transfer") {
      const destinationId = validated.to_warehouse_id;
      if (!destinationId) {
        throw new BadParameterException("Transfer requires to_warehouse_id.");
      }
      const destination = await WarehouseModel.findOne({ where: { uuid: destinationId, deleted_at: null } });
      await assertSameOrg(destination, organizationId, "Destination warehouse");
      if (destinationId === validated.warehouse_id) {
        throw new BadParameterException("Transfer source and destination must differ.");
      }
    }

    await ProductModelFactory();
    const product = await ProductModel.findOne({ where: { uuid: validated.product_id, deleted_at: null } });
    await assertSameOrg(product, organizationId, "Product");

    if (validated.variant_id) {
      await ProductVariantModelFactory();
      const variant = await ProductVariantModel.findOne({ where: { uuid: validated.variant_id, deleted_at: null } });
      if (!variant || variant.product_id !== validated.product_id) {
        throw new NotFoundException("Product variant not found for this product.");
      }
      await assertSameOrg(variant, organizationId, "Product variant");
    }

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: MovementCreateContext): Promise<Movement[]> {
    return insertMovementRow(context.input, context.organizationId);
  }

  protected async postExec(result: Movement[], context?: MovementCreateContext): Promise<Movement[]> {
    for (const row of result) {
      void recordActivityLog({
        actor: context?.actor ?? null,
        operation: "create",
        entity: "movement",
        entity_uuid: row.uuid,
        origin: null,
        updated: row as unknown as Record<string, unknown>,
      });
    }
    return super.postExec(result, context);
  }
}
