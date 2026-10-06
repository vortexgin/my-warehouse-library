import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { WarehouseCreateUseCase } from "@/app/warehouse/useCases/warehouse/WarehouseCreateUseCase";
import { WarehouseListUseCase } from "@/app/warehouse/useCases/warehouse/WarehouseListUseCase";
import type { CreateWarehouseInput } from "@/app/warehouse/models/WarehouseModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new WarehouseListUseCase().exec(
      {
        filter: {
          q: queryParam(params, "filter[q]"),
          code: queryParam(params, "filter[code]"),
          name: queryParam(params, "filter[name]"),
          status: queryParam(params, "filter[status]"),
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
    return fail(error.message ?? "Failed to fetch warehouses.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreateWarehouseInput>;

    const row = await new WarehouseCreateUseCase().exec(payload as CreateWarehouseInput, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create warehouse.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["warehouse:warehouse:list:list"]);
export const POST = withAuthorization(handlePost, ["warehouse:warehouse:create:create"]);
