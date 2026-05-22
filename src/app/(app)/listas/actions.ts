"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

function hintForError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("row-level security") || m.includes("rls")) {
    return " (Revisá policies RLS de la tabla)";
  }
  if (m.includes("does not exist") || m.includes("relation")) {
    return " (La tabla no existe: creala en Supabase)";
  }
  return "";
}

export async function upsertMotivos(params: { nombres: string[] }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no configurado");
  await requireAdmin();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!userData.user) throw new Error("No autenticado");

  const rows = params.nombres.map((nombre) => ({ nombre }));
  const { error } = await supabase
    .from("motivos")
    .upsert(rows, { onConflict: "nombre" });

  if (error) throw new Error(`${error.message}${hintForError(error.message)}`);
}

export async function addMotivo(params: { nombre: string }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no configurado");
  await requireAdmin();

  const nombre = params.nombre.trim();
  if (!nombre) throw new Error("Nombre requerido");

  const { error } = await supabase
    .from("motivos")
    .upsert({ nombre }, { onConflict: "nombre" });

  if (error) throw new Error(`${error.message}${hintForError(error.message)}`);
}

export async function addChofer(params: { nombre: string }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no configurado");
  await requireAdmin();

  const nombre = params.nombre.trim();
  if (!nombre) throw new Error("Nombre requerido");

  const { error } = await supabase
    .from("choferes")
    .upsert({ nombre }, { onConflict: "nombre" });

  if (error) throw new Error(`${error.message}${hintForError(error.message)}`);
}

export async function upsertChoferes(params: { nombres: string[] }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no configurado");
  await requireAdmin();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!userData.user) throw new Error("No autenticado");

  const rows = params.nombres.map((nombre) => ({ nombre }));
  const { error } = await supabase
    .from("choferes")
    .upsert(rows, { onConflict: "nombre" });

  if (error) throw new Error(`${error.message}${hintForError(error.message)}`);
}
