import type { Metadata } from "next";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { MovementForm } from "@/app/warehouse/components/movement/MovementForm";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "New movement | VortexGin",
};

export default async function MovementCreatePage() {
  const session = await requireSession();

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["warehouse:movement:create:create"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >

      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <MovementForm />
      </main>
    </AuthComponent>
  );
}
