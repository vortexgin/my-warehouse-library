import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connectDatabase } from "@/database/sequelize";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { WarehouseForm } from "@/app/warehouse/components/warehouse/WarehouseForm";
import { requireSession } from "@/libraries/Auth";
import { WarehouseGetUseCase } from "@/app/warehouse/useCases/warehouse/WarehouseGetUseCase";

export const metadata: Metadata = {
  title: "Edit warehouse | VortexGin",
};

export default async function WarehouseEditPage({
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
      allowedPermissions={["warehouse:warehouse:view:update"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <WarehouseForm
          mode="edit"
          uuid={warehouse.uuid}
          initial={{
            code: warehouse.code,
            name: warehouse.name,
            address: warehouse.address,
            status: warehouse.status,
          }}
        />
      </main>
    </AuthComponent>
  );
}
