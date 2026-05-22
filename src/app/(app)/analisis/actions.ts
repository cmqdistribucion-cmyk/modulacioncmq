"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export async function getAnalisisData(params?: { from?: string; to?: string }) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no configurado");

  let query = supabase
    .from("modulaciones")
    .select("created_at, actualizacion");

  if (params?.from) {
    query = query.gte("created_at", params.from);
  }
  if (params?.to) {
    query = query.lte("created_at", params.to);
  }

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []) as Array<{ created_at: string; actualizacion: string | null }>;
}
