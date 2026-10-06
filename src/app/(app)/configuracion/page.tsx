import { isAdmin } from "@/lib/auth/admin";
import { redirect } from "next/navigation";
import { ConfiguracionClient } from "./ConfiguracionClient";

export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  try {
    const admin = await isAdmin();
    if (!admin) redirect("/dashboard");
    return <ConfiguracionClient />;
  } catch (error) {
    console.error("Error en ConfiguracionPage:", error);
    throw error;
  }
}
