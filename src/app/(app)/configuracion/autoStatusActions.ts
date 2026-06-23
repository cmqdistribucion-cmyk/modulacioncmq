"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export async function getAutoStatusConfig() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { enabled: false, hour: 21 };

  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["auto_status_enabled", "auto_status_hour"]);

  const config = (data || []).reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {} as Record<string, string>);

  return {
    enabled: config.auto_status_enabled === "true",
    hour: parseInt(config.auto_status_hour || "21", 10),
  };
}

export async function saveAutoStatusConfig(params: { enabled: boolean; hour: number }) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no configurado");

  const { error } = await supabase.from("settings").upsert([
    { key: "auto_status_enabled", value: params.enabled ? "true" : "false" },
    { key: "auto_status_hour", value: params.hour.toString() },
  ], { onConflict: "key" });

  if (error) throw new Error(error.message);
}

export async function runAutoStatusUpdate() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no configurado");

  // Verificar si la funcionalidad está activada
  const config = await getAutoStatusConfig();
  if (!config.enabled) {
    return { success: true, updated: 0, message: "Funcionalidad desactivada" };
  }

  // Actualizar todas las modulaciones pendientes del día a "entregado"
  const today = new Date().toISOString().split("T")[0];
  const startDate = `${today}T00:00:00`;
  const endDate = `${today}T23:59:59`;

  const { data: modulaciones, error: selectError } = await supabase
    .from("modulaciones")
    .select("id, created_at")
    .gte("created_at", startDate)
    .lte("created_at", endDate)
    .or("actualizacion.eq.pendiente,actualizacion.is.null");

  if (selectError) throw new Error(selectError.message);

  if (!modulaciones || modulaciones.length === 0) {
    return { success: true, updated: 0, message: "No hay modulaciones pendientes para actualizar" };
  }

  const { error: updateError } = await supabase
    .from("modulaciones")
    .update({
      actualizacion: "entregado",
      updated_at: new Date().toISOString(),
    })
    .in("id", modulaciones.map(m => m.id));

  if (updateError) throw new Error(updateError.message);

  return { 
    success: true, 
    updated: modulaciones.length,
    message: `Se actualizaron ${modulaciones.length} modulaciones a estado "entregado"`
  };
}
