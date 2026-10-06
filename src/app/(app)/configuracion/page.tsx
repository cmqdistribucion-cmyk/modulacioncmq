import { isAdmin } from "@/lib/auth/admin";
import { redirect } from "next/navigation";
import { ConfiguracionClient } from "./ConfiguracionClient";

export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  const admin = await isAdmin();
  if (!admin) redirect("/dashboard");
  return <ConfiguracionClient />;
}
