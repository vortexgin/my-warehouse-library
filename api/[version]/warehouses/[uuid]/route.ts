import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { WarehouseDeleteUseCase } from "@/app/warehouse/useCases/warehouse/WarehouseDeleteUseCase";
import { WarehouseGetUseCase } from "@/app/warehouse/useCases/warehouse/WarehouseGetUseCase";
import { WarehouseUpdateUseCase } from "@/app/warehouse/useCases/warehouse/WarehouseUpdateUseCase";
import type { UpdateWarehouseInput } from "@/app/warehouse/models/WarehouseModel";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new WarehouseGetUseCase().exec(uuid);

    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch warehouse.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as UpdateWarehouseInput;

    const row = await new WarehouseUpdateUseCase().exec(uuid, payload, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update warehouse.", getErrorStatus(error, 400));
  }
}

async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new WarehouseDeleteUseCase().exec(uuid, await actorFromRequest(request));

    return ok({ message: "Warehouse deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete warehouse.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["warehouse:warehouse:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "warehouse:warehouse:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["warehouse:warehouse:view:delete"]);
