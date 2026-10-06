import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { connectDatabase } from "@/database/sequelize";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { MOVEMENT_LIST_PATH } from "@/app/warehouse/views/movements/paths";
import { requireSession } from "@/libraries/Auth";
import { MovementGetUseCase } from "@/app/warehouse/useCases/movement/MovementGetUseCase";

export const metadata: Metadata = {
  title: "Movement detail | VortexGin",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="break-all text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export default async function MovementDetailPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const session = await requireSession();

  const { uuid } = await params;
  await connectDatabase();

  let movement;
  try {
    movement = await new MovementGetUseCase().exec(uuid);
  } catch {
    notFound();
  }
  if (!movement) {
    notFound();
  }

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["warehouse:movement:view:detail"]}
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
              {movement.type} · {movement.qty}
            </h1>

            <dl className="mt-6">
              <Row label="UUID" value={movement.uuid} />
              <Row label="Type" value={movement.type} />
              <Row label="Qty" value={String(movement.qty)} />
              <Row label="Balance after" value={String(movement.balance_after)} />
              <Row label="Warehouse" value={movement.warehouse_id} />
              <Row label="Product" value={movement.product_id} />
              <Row label="Variant" value={movement.variant_id ?? "—"} />
              <Row label="Reference" value={[movement.ref_type, movement.ref_id].filter(Boolean).join(" / ") || "—"} />
              <Row label="Notes" value={movement.notes ?? "—"} />
              <Row label="Created" value={movement.created_at} />
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={MOVEMENT_LIST_PATH}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Back to list
              </Link>
            </div>
          </div>
          <ActivityTimeline entity="movement" entityUuid={movement.uuid} />
        </div>
      </main>
    </AuthComponent>
  );
}
