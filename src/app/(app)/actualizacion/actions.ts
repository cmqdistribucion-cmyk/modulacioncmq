"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActualizacionValue = "rechazado" | "pendiente" | "entregado";

export async function listModulacionesByDate(params: { date: string }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no configurado");

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!userData.user) throw new Error("No autenticado");

  // Rango de fechas para el día seleccionado
  const startDate = `${params.date}T00:00:00.000Z`;
  const endDate = `${params.date}T23:59:59.999Z`;

  const fullSelect = "id,created_at,updated_at,cliente_numero,cliente_nombre,motivo,chofer,bultos,hl,actualizacion,created_by_email";
  const { data, error } = await supabase
    .from("modulaciones")
    .select(fullSelect)
    .gte("created_at", startDate)
    .lte("created_at", endDate)
    .order("created_at", { ascending: false });

  let resultData = data;

  if (error) {
    const msg = error.message.toLowerCase();
    const isMissingColumn = msg.includes("does not exist") || msg.includes("could not find");
    
    if (isMissingColumn) {
      // Fallback a columnas básicas si las nuevas no existen
      const safeSelect = "id,created_at,cliente_numero,cliente_nombre,motivo,chofer,bultos";
      const { data: safeData, error: safeError } = await supabase
        .from("modulaciones")
        .select(safeSelect)
        .gte("created_at", startDate)
        .lte("created_at", endDate)
        .order("created_at", { ascending: false });
      
      if (safeError) throw new Error(safeError.message);
      resultData = safeData;
    } else {
      throw new Error(error.message);
    }
  }

  // Obtener puntuaciones (RMD) para estos clientes
  const items = resultData ?? [];
  const numeros = Array.from(new Set(items.map(r => r.cliente_numero)));
  const scores: Record<string, number> = {};
  
  if (numeros.length > 0) {
    const { data: scoreData } = await supabase
      .from("puntuaciones")
      .select("cliente_numero,puntuacion")
      .in("cliente_numero", numeros)
      .order("fecha", { ascending: false });
    
    if (scoreData) {
      scoreData.forEach(s => {
        if (!scores[s.cliente_numero]) {
          scores[s.cliente_numero] = s.puntuacion;
        }
      });
    }
  }

  return items.map(r => ({
    ...r,
    puntuacion: scores[r.cliente_numero] ?? null
  })) as Array<Record<string, unknown>>;
}

export async function listModulacionesByClienteNumero(params: { clienteNumero: string }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no configurado");

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!userData.user) throw new Error("No autenticado");

  const numero = params.clienteNumero.trim();
  if (!numero) return [];

  const { data, error } = await supabase
    .from("modulaciones")
    .select("id,created_at,cliente_numero,cliente_nombre,motivo,chofer,bultos,comentario,actualizacion")
    .eq("cliente_numero", numero)
    .eq("created_by", userData.user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!error) return (data ?? []) as Array<Record<string, unknown>>;

  const msg = error.message.toLowerCase();
  const missingColumn =
    msg.includes("actualizacion") ||
    msg.includes("could not find the") ||
    msg.includes("does not exist");
  if (!missingColumn) throw new Error(error.message);

  const { data: legacy, error: legacyErr } = await supabase
    .from("modulaciones")
    .select("id,created_at,cliente_numero,cliente_nombre,motivo,chofer,bultos,comentario")
    .eq("cliente_numero", numero)
    .eq("created_by", userData.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (legacyErr) throw new Error(legacyErr.message);

  return (legacy ?? []).map((r) => ({ ...r, actualizacion: null })) as Array<
    Record<string, unknown>
  >;
}

export async function updateModulacionActualizacion(params: {
  modulacionId: string;
  clienteNumero: string;
  actualizacion: ActualizacionValue;
}) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no configurado");

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!userData.user) throw new Error("No autenticado");

  const numero = params.clienteNumero.trim();
  if (!numero) throw new Error("Nº de cliente requerido");

  const allowed: ActualizacionValue[] = ["rechazado", "pendiente", "entregado"];
  if (!allowed.includes(params.actualizacion)) throw new Error("Valor inválido");

  const { data, error } = await supabase
    .from("modulaciones")
    .update({ actualizacion: params.actualizacion })
    .eq("id", params.modulacionId)
    .eq("cliente_numero", numero)
    .eq("created_by", userData.user.id)
    .select("id")
    .limit(1);

  if (!error && data?.length) return;
  if (error) {
    const msg = error.message.toLowerCase();
    const missingColumn =
      msg.includes("actualizacion") ||
      msg.includes("could not find the") ||
      msg.includes("does not exist");
    if (missingColumn)
      throw new Error('Falta la columna "actualizacion" en la tabla modulaciones.');
    throw new Error(error.message);
  }

  throw new Error("No encontré esa modulación (o no tenés permiso).");
}
