import Joi from "joi";
import WarehouseModelFactory, { WarehouseModel, type Warehouse } from "@/app/warehouse/models/WarehouseModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getWarehouseSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class WarehouseGetUseCase extends BaseUseCase<string, Warehouse | null, string> {

  private warehouseData?: WarehouseModel | null;

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getWarehouseSchema, { uuid });

    await WarehouseModelFactory();
    this.warehouseData = await WarehouseModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.warehouseData) {
      throw new NotFoundException("Warehouse not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<Warehouse | null> {
    return WarehouseModel.toApi(this.warehouseData?.toJSON());
  }
}
