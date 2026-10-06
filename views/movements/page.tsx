import type { Metadata } from "next";
import Link from "next/link";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { MovementTable } from "@/app/warehouse/components/movement/MovementTable";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "Movements | VortexGin",
};

export default async function MovementListPage({
  searchParams,
}: {
  searchParams?: Promise<{ warehouse_id?: string; product_id?: string }>;
}) {
  const session = await requireSession();
  const query = (await searchParams) ?? {};
  const preset: Record<string, string> = {};
  if (query.warehouse_id) {
    preset["filter[warehouse_id]"] = query.warehouse_id;
  }
  if (query.product_id) {
    preset["filter[product_id]"] = query.product_id;
  }

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["warehouse:movement:list:list"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full">
          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Warehouse</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Movements.</h1>
                <p className="mt-2 text-sm text-slate-500">
                  Append-only ledger. Rows are never edited — reversals are new rows.
                </p>
              </div>
              <AuthComponent
                user={session.user}
                permissions={session.permissions}
                allowedPermissions={["warehouse:movement:create:create"]}
              >
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/warehouse/views/movements/create"
                    className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    New movement
                  </Link>
                  <Link
                    href="/warehouse/views/movements/import"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    Import
                  </Link>
                </div>
              </AuthComponent>
            </div>

            <MovementTable session={session} extraParams={preset} />
          </div>
        </div>
      </main>
    </AuthComponent>
  );
}
