import Joi from "joi";
import { Op, UniqueConstraintError } from "sequelize";
import WarehouseModelFactory, { WarehouseModel, type UpdateWarehouseInput, type Warehouse } from "@/app/warehouse/models/WarehouseModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";
import NotFoundException from "@/exceptions/NotFoundException";

const updateWarehouseSchema = Joi.object({
  code: Joi.string().trim().min(2).max(30).optional(),
  name: Joi.string().trim().min(2).max(120).optional(),
  address: Joi.string().trim().allow("", null).max(255).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).unknown(false).min(1);

export class WarehouseUpdateUseCase extends BaseUseCase<string, Warehouse, { uuid: string; input: UpdateWarehouseInput; actor: ActivityActor }> {

  private warehouseData?: WarehouseModel | null;
  private beforeData?: Warehouse | null;

  protected async preExec(uuid: string, input: UpdateWarehouseInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateWarehouseInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateWarehouseInput>(updateWarehouseSchema, input);

    await WarehouseModelFactory();
    this.warehouseData = await WarehouseModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.warehouseData) {
      throw new NotFoundException("Warehouse not found")
    }
    this.beforeData = WarehouseModel.toApi(this.warehouseData?.toJSON());

    if (validatedInput.code?.trim()) {
      const codeTaken = await WarehouseModel.findOne({
        where: {
          organization_id: this.beforeData?.organization_id ?? null,
          code: validatedInput.code.trim().toUpperCase(),
          uuid: { [Op.ne]: uuid },
          deleted_at: null,
        },
      });
      if (codeTaken) {
        throw new DuplicateEntityException("A warehouse with this code already exists.");
      }
    }

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateWarehouseInput; actor: ActivityActor }): Promise<Warehouse> {
    const { input } = context;
    const nextData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (typeof input.code === "string" && input.code.trim()) {
      nextData.code = input.code.trim().toUpperCase();
    }

    if (typeof input.name === "string" && input.name.trim()) {
      nextData.name = input.name.trim();
    }

    if (Object.prototype.hasOwnProperty.call(input, "address")) {
      nextData.address = input.address?.trim() || null;
    }

    if (input.status) {
      nextData.status = input.status;
      if (input.status === "deleted") {
        nextData.deleted_at = new Date();
      } else {
        nextData.deleted_at = null;
      }
    }

    try {
      await this.warehouseData?.update(nextData);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("A warehouse with this code already exists.");
      }
      throw error;
    }

    return WarehouseModel.toApi(this.warehouseData?.toJSON());
  }

  protected async postExec(
    result: Warehouse,
    context?: { uuid: string; input: UpdateWarehouseInput; actor: ActivityActor },
  ): Promise<Warehouse> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "warehouse",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
