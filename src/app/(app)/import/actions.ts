"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export type ClienteUpsert = {
  title?: string | null;
  numero_cliente: string;
  nombre?: string | null;
  domicilio?: string | null;
  vendedor?: string | null;
  sv?: string | null;
  telefono?: string | null;
  zona?: string | null;
  msj_en_fra?: string | null;
};

export async function upsertClientes(params: { rows: ClienteUpsert[] }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no configurado");

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!userData.user) throw new Error("No autenticado");

  if (!params.rows.length) return;

  const { error } = await supabase
    .from("clientes")
    .upsert(params.rows, { onConflict: "numero_cliente" });

  if (error) throw new Error(error.message);
}
