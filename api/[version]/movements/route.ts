import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { MovementCreateUseCase } from "@/app/warehouse/useCases/movement/MovementCreateUseCase";
import { MovementListUseCase } from "@/app/warehouse/useCases/movement/MovementListUseCase";
import type { MovementWriteInput } from "@/app/warehouse/libraries/insertMovementRow";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new MovementListUseCase().exec(
      {
        filter: {
          warehouse_id: queryParam(params, "filter[warehouse_id]"),
          product_id: queryParam(params, "filter[product_id]"),
          variant_id: queryParam(params, "filter[variant_id]"),
          type: queryParam(params, "filter[type]"),
          ref_type: queryParam(params, "filter[ref_type]"),
          ref_id: queryParam(params, "filter[ref_id]"),
          date_from: queryParam(params, "filter[date_from]"),
          date_to: queryParam(params, "filter[date_to]"),
        },
        sortProperty: queryParam(params, "sortProperty"),
        sortDirection: queryParam(params, "sortDirection"),
        offset: queryParam(params, "offset"),
        limit: queryParam(params, "limit"),
      },
      await actorFromRequest(request),
    );
    return ok(rows);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch movements.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<MovementWriteInput>;

    const rows = await new MovementCreateUseCase().exec(payload as MovementWriteInput, await actorFromRequest(request));
    return ok(rows, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create movement.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["warehouse:movement:list:list"]);
export const POST = withAuthorization(handlePost, ["warehouse:movement:create:create"]);
