import { randomUUID } from "crypto";
import Joi from "joi";
import { UniqueConstraintError } from "sequelize";
import WarehouseModelFactory, { WarehouseModel, type CreateWarehouseInput, type Warehouse } from "@/app/warehouse/models/WarehouseModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";

const createWarehouseSchema = Joi.object({
  code: Joi.string().trim().min(2).max(30).required(),
  name: Joi.string().trim().min(2).max(120).required(),
  address: Joi.string().trim().allow("", null).max(255).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).unknown(false);

export class WarehouseCreateUseCase extends BaseUseCase<CreateWarehouseInput, Warehouse, { input: CreateWarehouseInput; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(input: CreateWarehouseInput, actor?: ActivityActor): Promise<{ input: CreateWarehouseInput; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<CreateWarehouseInput>(createWarehouseSchema, input);

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await WarehouseModelFactory();
    const existingRow = await WarehouseModel.findOne({
      where: { organization_id: organizationId, code: validated.code.trim().toUpperCase(), deleted_at: null },
    });
    if (existingRow) {
      throw new DuplicateEntityException("A warehouse with this code already exists.");
    }

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { input: CreateWarehouseInput; actor: ActivityActor; organizationId: string | null }): Promise<Warehouse> {
    const { input, organizationId } = context;
    await WarehouseModelFactory();
    try {
      const row = await WarehouseModel.create({
        uuid: randomUUID(),
        organization_id: organizationId ?? null,
        code: input.code.trim().toUpperCase(),
        name: input.name?.trim(),
        address: input.address?.trim() || null,
        status: input.status ?? "active",
        deleted_at: null,
      });

      return WarehouseModel.toApi(row.toJSON());
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("A warehouse with this code already exists.");
      }
      throw error;
    }
  }

  protected async postExec(
    result: Warehouse,
    context?: { input: CreateWarehouseInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<Warehouse> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "warehouse",
      entity_uuid: result.uuid,
      origin: null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
