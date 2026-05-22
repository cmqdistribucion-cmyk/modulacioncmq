"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

type StepResult =
  | { ok: true; message: string; data?: Record<string, unknown> }
  | { ok: false; message: string };

export async function runDiagnostics(): Promise<{
  ok: boolean;
  steps: Record<string, StepResult>;
}> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      ok: false,
      steps: {
        env: { ok: false, message: "Supabase no configurado en .env.local" },
      },
    };
  }

  try {
    await requireAdmin();
  } catch {
    return {
      ok: false,
      steps: {
        authz: { ok: false, message: "No autorizado (solo admin)" },
      },
    };
  }

  const steps: Record<string, StepResult> = {};

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    steps.auth = { ok: false, message: userError.message };
    return { ok: false, steps };
  }
  if (!userData.user) {
    steps.auth = { ok: false, message: "No autenticado" };
    return { ok: false, steps };
  }
  steps.auth = {
    ok: true,
    message: "Sesión OK",
    data: {
      userId: userData.user.id,
      email: userData.user.email ?? null,
    },
  };

  const { error: clientesCountError, count: clientesCount } = await supabase
    .from("clientes")
    .select("id", { count: "exact", head: true });

  if (clientesCountError) {
    steps.clientes_select = { ok: false, message: clientesCountError.message };
  } else {
    steps.clientes_select = {
      ok: true,
      message: "SELECT clientes OK",
      data: { count: typeof clientesCount === "number" ? clientesCount : null },
    };
  }

  const testNumero = `__TEST_${Date.now()}`;

  const { error: upsertError } = await supabase
    .from("clientes")
    .upsert(
      [
        {
          numero_cliente: testNumero,
          nombre: "Cliente de prueba",
          domicilio: "—",
          telefono: "—",
          zona: "TEST",
        },
      ],
      { onConflict: "numero_cliente" },
    );

  if (upsertError) {
    steps.clientes_upsert = { ok: false, message: upsertError.message };
  } else {
    steps.clientes_upsert = {
      ok: true,
      message: "UPSERT clientes OK",
      data: { numero_cliente: testNumero },
    };
  }

  const { data: readBack, error: readBackError } = await supabase
    .from("clientes")
    .select("id,numero_cliente,nombre")
    .eq("numero_cliente", testNumero)
    .maybeSingle();

  if (readBackError) {
    steps.clientes_readback = { ok: false, message: readBackError.message };
  } else if (!readBack) {
    steps.clientes_readback = {
      ok: false,
      message: "No encontré el cliente de prueba luego del upsert.",
    };
  } else {
    steps.clientes_readback = {
      ok: true,
      message: "Lectura post-upsert OK",
      data: { id: readBack.id, numero_cliente: readBack.numero_cliente },
    };
  }

  if (readBack?.id) {
    const { error: modError } = await supabase.from("modulaciones").insert({
      cliente_id: readBack.id,
      cliente_numero: testNumero,
      cliente_nombre: "Cliente de prueba",
      zona: "TEST",
      vendedor: null,
      sv: null,
      motivo: "Entrega",
      chofer: "Juan",
      bultos: 1,
      comentario: "Diagnóstico",
      created_by: userData.user.id,
    });

    if (modError) {
      steps.modulaciones_insert = { ok: false, message: modError.message };
    } else {
      steps.modulaciones_insert = {
        ok: true,
        message: "INSERT modulaciones OK",
      };
    }
  } else {
    steps.modulaciones_insert = {
      ok: false,
      message: "No pude probar modulaciones porque no tengo cliente_id.",
    };
  }

  const { error: deleteError } = await supabase
    .from("clientes")
    .delete()
    .eq("numero_cliente", testNumero);

  if (deleteError) {
    steps.clientes_delete = { ok: false, message: deleteError.message };
  } else {
    steps.clientes_delete = { ok: true, message: "DELETE cliente de prueba OK" };
  }

  const ok = Object.values(steps).every((s) => s.ok);
  return { ok, steps };
}
