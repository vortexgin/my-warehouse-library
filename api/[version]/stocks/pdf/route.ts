import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { GenerateStockPdfUseCase } from "@/app/warehouse/useCases/stock/GenerateStockPdfUseCase";

export const runtime = "nodejs";
async function handlePost(request: NextRequest) {
  try { await connectDatabase(); return ok(await new GenerateStockPdfUseCase().exec(await request.json(), await actorFromRequest(request))); }
  catch (error: any) { return fail(error.message ?? "Failed to generate stock report PDF.", getErrorStatus(error, 500)); }
}
export const POST = withAuthorization(handlePost, ["warehouse:stock:list:list"]);
