import { isAdmin } from "@/lib/auth/admin";
import { redirect } from "next/navigation";
import { ConfiguracionClient } from "./ConfiguracionClient";

export default async function ConfiguracionPage() {
  const admin = await isAdmin();
  if (!admin) redirect("/dashboard");
  return <ConfiguracionClient />;
}
