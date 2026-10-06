import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { MovementGetUseCase } from "@/app/warehouse/useCases/movement/MovementGetUseCase";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new MovementGetUseCase().exec(uuid);

    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch movement.", getErrorStatus(error, 500));
  }
}

// Append-only ledger: no PUT/DELETE handlers by design (Next.js answers 404).

export const GET = withAuthorization(handleGet, ["warehouse:movement:view:detail"]);
