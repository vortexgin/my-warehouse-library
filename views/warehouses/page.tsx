import type { Metadata } from "next";
import Link from "next/link";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { WarehouseTable } from "@/app/warehouse/components/warehouse/WarehouseTable";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "Warehouses | VortexGin",
};

export default async function WarehouseListPage() {
  const session = await requireSession();

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["warehouse:warehouse:list:list"]}
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
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Warehouses.</h1>
                <p className="mt-2 text-sm text-slate-500">
                  Storage locations, isolated per organization.
                </p>
              </div>
              <AuthComponent
                user={session.user}
                permissions={session.permissions}
                allowedPermissions={["warehouse:warehouse:create:create"]}
              >
                <Link
                  href="/warehouse/views/warehouses/create"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  New warehouse
                </Link>
              </AuthComponent>
            </div>

            <WarehouseTable session={session} />
          </div>
        </div>
      </main>
    </AuthComponent>
  );
}
