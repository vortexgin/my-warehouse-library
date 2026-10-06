import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { connectDatabase } from "@/database/sequelize";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { STOCK_LIST_PATH } from "@/app/warehouse/views/stocks/paths";
import { requireSession } from "@/libraries/Auth";
import { StockGetUseCase } from "@/app/warehouse/useCases/stock/StockGetUseCase";

export const metadata: Metadata = {
  title: "Stock detail | VortexGin",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="break-all text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const session = await requireSession();

  const { uuid } = await params;
  await connectDatabase();

  let stock;
  try {
    stock = await new StockGetUseCase().exec(uuid);
  } catch {
    notFound();
  }
  if (!stock) {
    notFound();
  }

  const available = stock.qty_on_hand - stock.qty_reserved;

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["warehouse:stock:view:detail"]}
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
              Stock balance.
            </h1>

            <dl className="mt-6">
              <Row label="UUID" value={stock.uuid} />
              <Row label="Warehouse" value={stock.warehouse_id} />
              <Row label="Product" value={stock.product_id} />
              <Row label="Variant" value={stock.variant_id ?? "—"} />
              <Row label="On hand" value={String(stock.qty_on_hand)} />
              <Row label="Reserved" value={String(stock.qty_reserved)} />
              <Row label="Available" value={String(available)} />
              <Row label="Status" value={stock.status} />
              <Row label="Updated" value={stock.updated_at} />
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={STOCK_LIST_PATH}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Back to list
              </Link>
              <Link
                href={`/warehouse/views/movements?warehouse_id=${stock.warehouse_id}&product_id=${stock.product_id}`}
                className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Movement history
              </Link>
            </div>
          </div>
        </div>
      </main>
    </AuthComponent>
  );
}
