import Joi from "joi";
import WarehouseModelFactory, { WarehouseModel, type Warehouse } from "@/app/warehouse/models/WarehouseModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const deleteWarehouseSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});
export class WarehouseDeleteUseCase extends BaseUseCase<string, boolean, { uuid: string; actor: ActivityActor }> {

  private warehouseData?: WarehouseModel | null;
  private beforeData?: Warehouse | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const validatedUuid = await this.validate<{ uuid: string }>(deleteWarehouseSchema, { uuid });

    await WarehouseModelFactory();
    this.warehouseData = await WarehouseModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.warehouseData) {
      throw new NotFoundException("Warehouse not found")
    }
    this.beforeData = WarehouseModel.toApi(this.warehouseData?.toJSON());
    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor }): Promise<boolean> {
    const { uuid } = context;
    await WarehouseModelFactory();
    const [affectedRows] = await WarehouseModel.update(
      {
        status: "deleted",
        deleted_at: new Date(),
        updated_at: new Date(),
      },
      {
        where: { uuid, deleted_at: null },
      },
    );

    return affectedRows > 0;
  }

  protected async postExec(
    result: boolean,
    context?: { uuid: string; actor: ActivityActor },
  ): Promise<boolean> {
    if (result) {
      void recordActivityLog({
        actor: context?.actor ?? null,
        operation: "delete",
        entity: "warehouse",
        entity_uuid: context?.uuid ?? null,
        origin: this.beforeData ?? null,
        updated: null,
      });
    }
    return super.postExec(result, context);
  }
}
