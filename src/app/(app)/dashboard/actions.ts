"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function createModulacion(params: {
  clienteId: string;
  clienteNumero: string;
  clienteNombre: string | null;
  zona: string | null;
  vendedor: string | null;
  sv: string | null;
  motivo: string;
  chofer: string;
  bultos: number;
  hl?: number;
  comentario: string;
}) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no configurado");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!userData.user) throw new Error("No autenticado");

  const baseRow = {
    cliente_id: params.clienteId,
    cliente_numero: params.clienteNumero,
    cliente_nombre: params.clienteNombre,
    zona: params.zona,
    vendedor: params.vendedor,
    sv: params.sv,
    motivo: params.motivo,
    chofer: params.chofer,
    bultos: params.bultos,
    comentario: params.comentario,
    created_by: userData.user.id,
  };

  const fullRow = {
    ...baseRow,
    hl: params.hl,
    actualizacion: "pendiente",
    created_by_email: userData.user.email ?? null,
  };

  const { error: fullErr } = await supabase.from("modulaciones").insert(fullRow);
  if (!fullErr) return;

  const msg = fullErr.message.toLowerCase();
  const missingColumn =
    msg.includes("actualizacion") ||
    msg.includes("created_by_email") ||
    msg.includes("hl") ||
    msg.includes("could not find the") ||
    msg.includes("does not exist");
  if (!missingColumn) throw new Error(fullErr.message);

  const { error: fallbackErr } = await supabase.from("modulaciones").insert(baseRow);
  if (fallbackErr) throw new Error(fallbackErr.message);
}

async function whapiSendText(params: { to: string; body: string }) {
  const token = process.env.WHAPI_TOKEN ?? "";
  const baseUrl = (process.env.WHAPI_BASE_URL ?? "https://gate.whapi.cloud").replace(
    /\/$/,
    "",
  );
  if (!token) throw new Error("Falta WHAPI_TOKEN en el servidor");

  const res = await fetch(`${baseUrl}/messages/text`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: params.to, body: params.body }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WhatsApp API: ${res.status} ${text || res.statusText}`);
  }
}

function extractWhatsappInviteCode(link: string) {
  const raw = link.trim();
  if (!raw) return null;
  const m =
    raw.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{10,})/i) ??
    raw.match(/^([A-Za-z0-9_-]{10,})$/);
  return m?.[1] ?? null;
}

function findGroupJidDeep(value: unknown): string | null {
  if (typeof value === "string") {
    const v = value.trim();
    if (/@g\.us$/i.test(v)) return v;
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGroupJidDeep(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      const found = findGroupJidDeep(obj[k]);
      if (found) return found;
    }
  }
  return null;
}

async function whapiGetGroupIdByInviteLink(link: string) {
  const token = process.env.WHAPI_TOKEN ?? "";
  const baseUrl = (process.env.WHAPI_BASE_URL ?? "https://gate.whapi.cloud").replace(
    /\/$/,
    "",
  );
  if (!token) throw new Error("Falta WHAPI_TOKEN en el servidor");

  const code = extractWhatsappInviteCode(link);
  if (!code) throw new Error("Link de invitación inválido");

  const res = await fetch(`${baseUrl}/groups/link/${encodeURIComponent(code)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`No pude consultar el link: ${res.status} ${text || res.statusText}`);
  }
  const json = (await res.json().catch(() => null)) as unknown;
  const jid = findGroupJidDeep(json);
  if (jid) return jid;

  const maybe = json as Record<string, unknown> | null;
  const fallback =
    (typeof maybe?.group_id === "string" && maybe.group_id) ||
    (typeof maybe?.id === "string" && maybe.id) ||
    null;
  if (fallback) return fallback;

  throw new Error("No pude extraer group_id del link");
}

export async function sendModulacionWhatsappBySV(params: { sv: string | null; message: string }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no configurado");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!userData.user) throw new Error("No autenticado");

  const sv = String(params.sv ?? "").trim();
  if (!sv) {
    return { status: "missing_sv" as const };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("whatsapp_groups")
    .select("id,supervisor_name,group_id,group_link,active")
    .eq("supervisor_name", sv)
    .limit(1)
    .maybeSingle();

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("could not find the table") || msg.includes("whatsapp_groups")) {
      return { status: "missing_table" as const };
    }
    throw new Error(error.message);
  }

  if (!data) return { status: "not_found" as const };
  if (!data.active) return { status: "inactive" as const };
  let groupId = data.group_id ? String(data.group_id) : "";
  if (!groupId && data.group_link) {
    const resolved = await whapiGetGroupIdByInviteLink(String(data.group_link));
    groupId = resolved;
    await admin.from("whatsapp_groups").update({ group_id: groupId }).eq("id", data.id);
  }
  if (!groupId) return { status: "no_group_id" as const };

  await whapiSendText({ to: groupId, body: params.message });
  return { status: "sent" as const };
}

export async function analyzeScreenshotWithOpenRouter(params: {
  imageBase64: string;
  motivos: string[];
  choferes: string[];
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini"; // Modelo más económico por defecto
  if (!apiKey) throw new Error("Falta OPENROUTER_API_KEY en el servidor");

  // Prompt original funcional para extraer datos
  const prompt = `Extrae solo JSON con estos campos (nada más):
- numero_cliente: número de cliente (solo dígitos)
- cliente_nombre: nombre del comercio
- motivo: uno de la lista: [${params.motivos.join(", ")}]
- chofer: uno de la lista: [${params.choferes.join(", ")}] (ignorar números/legajos)
- bultos: número entero de bultos
- hl: número decimal de hectolitros (buscar "hl")
- comentario: texto adicional del motivo
- sv: nombre del supervisor si aparece`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://techpro-modulaciones.vercel.app",
      "X-Title": "TechPro Modulaciones",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${params.imageBase64}`,
                detail: "low" // Detalle bajo para reducir tokens de imagen
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  
  try {
    const jsonStr = content.replace(/```json|```/g, "").trim();
    return JSON.parse(jsonStr);
  } catch {
    console.error("Error parseando JSON de OpenRouter:", content);
    throw new Error("No se pudo parsear la respuesta de la IA");
  }
}

