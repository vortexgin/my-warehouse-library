import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { MovementImportPreviewUseCase } from "@/app/warehouse/useCases/movement/MovementImportPreviewUseCase";

export const runtime = "nodejs";

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as { rows: unknown[] };

    // Dry run: classification only, no writes.
    const preview = await new MovementImportPreviewUseCase().exec(payload, await actorFromRequest(request));
    return ok(preview);
  } catch (error: any) {
    return fail(error.message ?? "Failed to preview movement import.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["warehouse:movement:list:list"]);
