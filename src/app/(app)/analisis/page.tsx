import { AnalisisClient } from "./AnalisisClient";
import { isAdmin } from "@/lib/auth/admin";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Análisis de Datos",
};

export const dynamic = 'force-dynamic';

export default async function AnalisisPage() {
  const admin = await isAdmin();
  if (!admin) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-6">
      <AnalisisClient />
    </div>
  );
}
