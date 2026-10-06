import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { StockListUseCase } from "@/app/warehouse/useCases/stock/StockListUseCase";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new StockListUseCase().exec(
      {
        filter: {
          q: queryParam(params, "filter[q]"),
          warehouse_id: queryParam(params, "filter[warehouse_id]"),
          product_id: queryParam(params, "filter[product_id]"),
          variant_id: queryParam(params, "filter[variant_id]"),
          low_only: queryParam(params, "filter[low_only]") as unknown as boolean,
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
    return fail(error.message ?? "Failed to fetch stocks.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["warehouse:stock:list:list"]);
