import Joi from "joi";
import MovementModelFactory, { MovementModel, type Movement } from "@/app/warehouse/models/MovementModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getMovementSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class MovementGetUseCase extends BaseUseCase<string, Movement | null, string> {

  private movementData?: MovementModel | null;

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getMovementSchema, { uuid });

    await MovementModelFactory();
    this.movementData = await MovementModel.findOne({ where: { uuid: validatedUuid.uuid } });
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
