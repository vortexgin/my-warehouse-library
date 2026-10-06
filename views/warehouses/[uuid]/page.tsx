import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { connectDatabase } from "@/database/sequelize";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { DeleteWarehouseButton } from "@/app/warehouse/components/warehouse/DeleteWarehouseButton";
import { WAREHOUSE_LIST_PATH } from "@/app/warehouse/views/warehouses/paths";
import { requireSession } from "@/libraries/Auth";
import { WarehouseGetUseCase } from "@/app/warehouse/useCases/warehouse/WarehouseGetUseCase";

export const metadata: Metadata = {
  title: "Warehouse detail | VortexGin",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="break-all text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export default async function WarehouseDetailPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const session = await requireSession();

  const { uuid } = await params;
  await connectDatabase();

  let warehouse;
  try {
    warehouse = await new WarehouseGetUseCase().exec(uuid);
  } catch {
    notFound();
  }
  if (!warehouse) {
    notFound();
  }

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["warehouse:warehouse:view:detail"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >

      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Detail</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              {warehouse.name}
            </h1>

            <dl className="mt-6">
              <Row label="UUID" value={warehouse.uuid} />
              <Row label="Code" value={warehouse.code} />
              <Row label="Name" value={warehouse.name} />
              <Row label="Address" value={warehouse.address ?? "—"} />
              <Row label="Status" value={warehouse.status} />
              <Row label="Created" value={warehouse.created_at} />
              <Row label="Updated" value={warehouse.updated_at} />
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={WAREHOUSE_LIST_PATH}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Back to list
              </Link>
              <AuthComponent
                user={session.user}
                permissions={session.permissions}
                allowedPermissions={["warehouse:warehouse:view:update"]}
              >
                <Link
                  href={`/warehouse/views/warehouses/${warehouse.uuid}/edit`}
                  className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Edit
                </Link>
              </AuthComponent>
              <AuthComponent
                user={session.user}
                permissions={session.permissions}
                allowedPermissions={["warehouse:warehouse:view:delete"]}
              >
                <DeleteWarehouseButton uuid={warehouse.uuid} label={warehouse.name} redirectTo={WAREHOUSE_LIST_PATH} />
              </AuthComponent>

            </div>
          </div>
          <ActivityTimeline entity="warehouse" entityUuid={warehouse.uuid} />
        </div>
      </main>
    </AuthComponent>
  );
}
