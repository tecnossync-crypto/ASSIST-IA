import { ShieldCheck } from "lucide-react";
import { listarRoles } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { RolesPermisos } from "@/components/RolesPermisos";

export default async function RolesPage() {
  const roles = await listarRoles();

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <ConfiguracionHeader
        Icon={ShieldCheck}
        titulo="Roles y permisos"
        descripcion="Define qué puede ver y hacer cada tipo de usuario. Cada persona tiene un rol, que se asigna en Configuración → Agentes."
      />
      <RolesPermisos roles={roles} />
    </div>
  );
}
