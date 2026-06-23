import { isAdmin } from "@/lib/auth/admin";
import { redirect } from "next/navigation";
import { ActualizacionesClient } from "./ActualizacionesClient";

export default async function AdminPage() {
  const admin = await isAdmin();
  if (!admin) redirect("/dashboard");
  return <ActualizacionesClient />;
}
