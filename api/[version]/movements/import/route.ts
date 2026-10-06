import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { MovementImportUseCase } from "@/app/warehouse/useCases/movement/MovementImportUseCase";

export const runtime = "nodejs";

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as { rows: unknown[] };

    const result = await new MovementImportUseCase().exec(payload, await actorFromRequest(request));
    return ok(result, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to import movements.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["warehouse:movement:create:create"]);
