import { isAdmin } from "@/lib/auth/admin";
import { redirect } from "next/navigation";
import { UsuariosClient } from "./UsuariosClient";

export const dynamic = 'force-dynamic';

export default async function UsuariosPage() {
  const admin = await isAdmin();
  if (!admin) redirect("/dashboard");
  return <UsuariosClient />;
}

