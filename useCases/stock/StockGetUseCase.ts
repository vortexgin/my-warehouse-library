import Joi from "joi";
import StockModelFactory, { StockModel, type Stock } from "@/app/warehouse/models/StockModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getStockSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class StockGetUseCase extends BaseUseCase<string, Stock | null, string> {

  private stockData?: StockModel | null;

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getStockSchema, { uuid });

    await StockModelFactory();
    this.stockData = await StockModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.stockData) {
      throw new NotFoundException("Stock not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<Stock | null> {
    return StockModel.toApi(this.stockData?.toJSON());
  }
}
