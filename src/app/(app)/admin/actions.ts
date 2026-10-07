"use server";

import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type UserRow = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  role: "admin" | "usuario";
  avatar_url: string | null;
  is_banned: boolean;
};

export async function adminListUsers(): Promise<UserRow[]> {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();

  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers(
    {
      perPage: 200,
      page: 1,
    },
  );
  if (usersError) throw new Error(usersError.message);

  const userIds = usersData.users.map((u) => u.id);
  const { data: admins, error: adminsError } = await supabase
    .from("admins")
    .select("user_id")
    .in("user_id", userIds);
  if (adminsError) throw new Error(adminsError.message);

  const adminSet = new Set((admins ?? []).map((a) => a.user_id));

  return usersData.users.map((u) => {
    // Si banned_until es una fecha en el futuro, está baneado.
    // Supabase usa ISO strings para banned_until.
    const bannedUntil = u.banned_until ? new Date(u.banned_until) : null;
    const isBanned = Boolean(bannedUntil && bannedUntil.getTime() > Date.now());

    return {
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      role: adminSet.has(u.id) ? "admin" : "usuario",
      avatar_url: (u.user_metadata as Record<string, unknown> | null)?.avatar_url
        ? String((u.user_metadata as Record<string, unknown>).avatar_url)
        : null,
      is_banned: isBanned,
    };
  });
}

export async function adminCreateUser(params: {
  email: string;
  password: string;
  role: "admin" | "usuario";
}) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();

  const email = params.email.trim().toLowerCase();
  if (!email) throw new Error("Email requerido");
  if (!params.password) throw new Error("Contraseña requerida");

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: params.password,
    email_confirm: true,
  });

  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("No se pudo crear el usuario");

  if (params.role === "admin") {
    const { error: roleError } = await supabase
      .from("admins")
      .upsert({ user_id: data.user.id });
    if (roleError) throw new Error(roleError.message);
  }

  return { userId: data.user.id };
}

export async function adminSetPassword(params: { userId: string; password: string }) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();

  if (!params.userId) throw new Error("userId requerido");
  if (!params.password) throw new Error("Contraseña requerida");

  const { error } = await supabase.auth.admin.updateUserById(params.userId, {
    password: params.password,
  });

  if (error) throw new Error(error.message);
}

export async function adminSetUserBanned(params: { userId: string; banned: boolean }) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();

  if (!params.userId) throw new Error("userId requerido");

  const { error } = await supabase.auth.admin.updateUserById(params.userId, {
    ban_duration: params.banned ? "87600h" : "none", // 10 years or none
  });

  if (error) throw new Error(error.message);
}

export async function adminGenerateRecoveryLink(params: { email: string }) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();

  const email = params.email.trim().toLowerCase();
  if (!email) throw new Error("Email requerido");

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (error) throw new Error(error.message);
  return { actionLink: data.properties.action_link };
}

export async function adminSetRole(params: {
  userId: string;
  role: "admin" | "usuario";
}) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();

  if (!params.userId) throw new Error("userId requerido");

  if (params.role === "admin") {
    const { error } = await supabase.from("admins").upsert({ user_id: params.userId });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("admins").delete().eq("user_id", params.userId);
    if (error) throw new Error(error.message);
  }
}

export async function adminGetAppName(): Promise<string | null> {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "app_name")
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data?.value as string) ?? null;
}

export async function adminSetAppName(params: { name: string }) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const name = params.name.trim();
  if (!name) throw new Error("Nombre requerido");
  const { error } = await supabase
    .from("settings")
    .upsert({ key: "app_name", value: name }, { onConflict: "key" });
  if (error) {
    const msg = error.message.toLowerCase();
    const missingTable =
      msg.includes("could not find the table") ||
      msg.includes("public.settings") ||
      msg.includes("relation") ||
      msg.includes("does not exist");
    if (missingTable) {
      throw new Error(
        `Falta crear la tabla settings en Supabase. Ejecutá:\n\n` +
          `create table if not exists public.settings (\n` +
          `  key text primary key,\n` +
          `  value text not null\n` +
          `);\n`,
      );
    }
    throw new Error(error.message);
  }
}

export async function adminSetUserAvatar(params: {
  userId: string;
  base64: string;
  contentType: string;
}) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const userId = params.userId.trim();
  if (!userId) throw new Error("userId requerido");
  const match = params.contentType.match(/^image\/(png|jpeg|webp)$/);
  const ext = match ? (match[1] === "jpeg" ? "jpg" : match[1]) : "jpg";
  const filePath = `${userId}.${ext}`;
  const bucket = "avatars";

  const storage = supabase.storage as unknown as {
    createBucket: (
      name: string,
      opts: {
        public: boolean;
        fileSizeLimit: number;
        allowedMimeTypes: string[];
      },
    ) => Promise<{ error: { message: string } | null }>;
    updateBucket?: (
      name: string,
      opts: { public: boolean; fileSizeLimit?: number; allowedMimeTypes?: string[] },
    ) => Promise<{ error: { message: string } | null }>;
    from: (name: string) => {
      upload: (
        path: string,
        body: ArrayBuffer,
        opts: { upsert: boolean; contentType: string },
      ) => Promise<{ error: { message: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string | null } };
    };
  };

  const base64 = params.base64.trim();
  if (!base64) throw new Error("Imagen vacía");

  let bytes: Uint8Array;
  const atobFn = (globalThis as typeof globalThis & { atob?: (data: string) => string }).atob;
  if (typeof atobFn === "function") {
    const bin = atobFn(base64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  }

  const maxBytes = 5 * 1024 * 1024;
  if (bytes.byteLength > maxBytes) {
    throw new Error("La imagen supera el máximo permitido (5MB).");
  }

  const createRes = await storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  });
  if (createRes.error && storage.updateBucket) {
    await storage.updateBucket(bucket, { public: true });
  }

  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(filePath, bytes, { upsert: true, contentType: params.contentType });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(filePath);
  const url = publicUrl.publicUrl ?? null;

  const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { avatar_url: url },
  });
  if (updErr) throw new Error(updErr.message);

  return { url };
}

export type WhatsappGroupRow = {
  id: string;
  supervisor_name: string;
  group_link: string | null;
  group_id: string | null;
  active: boolean;
};

export async function adminListWhatsappGroups(): Promise<WhatsappGroupRow[]> {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_groups")
    .select("id,supervisor_name,group_link,group_id,active")
    .order("supervisor_name", { ascending: true });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("could not find the table") || msg.includes("whatsapp_groups")) {
      throw new Error(
        `Falta crear la tabla whatsapp_groups en Supabase. Ejecutá:\n\n` +
          `create table if not exists public.whatsapp_groups (\n` +
          `  id uuid primary key default gen_random_uuid(),\n` +
          `  supervisor_name text not null unique,\n` +
          `  group_link text,\n` +
          `  group_id text,\n` +
          `  active boolean not null default true\n` +
          `);\n`,
      );
    }
    throw new Error(error.message);
  }
  return (data ?? []) as WhatsappGroupRow[];
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
  if (!token) return null;

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

export async function adminResolveWhatsappGroupIdFromLink(params: { group_link: string }) {
  await requireAdmin();
  const group_link = params.group_link.trim();
  if (!group_link) throw new Error("group_link requerido");
  const group_id = await whapiGetGroupIdByInviteLink(group_link);
  if (!group_id) throw new Error("Falta WHAPI_TOKEN en el servidor");
  return { group_id };
}

export async function adminUpsertWhatsappGroup(params: {
  id?: string;
  supervisor_name: string;
  group_link?: string | null;
  group_id?: string | null;
  active: boolean;
}) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const supervisor_name = params.supervisor_name.trim();
  if (!supervisor_name) throw new Error("Supervisor requerido");

  const row = {
    id: params.id,
    supervisor_name,
    group_link: (params.group_link ?? null) ? String(params.group_link).trim() : null,
    group_id: (params.group_id ?? null) ? String(params.group_id).trim() : null,
    active: Boolean(params.active),
  };

  if (!row.group_id && row.group_link) {
    try {
      const resolved = await whapiGetGroupIdByInviteLink(row.group_link);
      if (resolved) row.group_id = resolved;
    } catch {
      // ignore; allow saving without group_id
    }
  }

  const { error } = await supabase
    .from("whatsapp_groups")
    .upsert(row, { onConflict: "supervisor_name" });
  if (error) throw new Error(error.message);
}

export async function adminDeleteWhatsappGroup(params: { id: string }) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const id = params.id.trim();
  if (!id) throw new Error("id requerido");
  const { error } = await supabase.from("whatsapp_groups").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function whapiSendText(params: { to: string; body: string }) {
  const token = process.env.WHAPI_TOKEN ?? "";
  const baseUrl = (process.env.WHAPI_BASE_URL ?? "https://gate.whapi.cloud").replace(
    /\/$/,
    "",
  );
  if (!token) throw new Error("Falta WHAPI_TOKEN en el servidor");

  try {
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
  } catch (error) {
    console.error("Error en whapiSendText:", error);
    throw error;
  }
}

export async function adminTestWhatsappGroup(params: { id: string }) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_groups")
    .select("id,group_id,group_link,active")
    .eq("id", params.id)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Error de base de datos: ${error.message}`);
  if (!data) throw new Error("Grupo no encontrado");
  if (!data.active) throw new Error("Grupo inactivo");
  let groupId = data.group_id ? String(data.group_id) : "";
  if (!groupId && data.group_link) {
    try {
      const resolved = await whapiGetGroupIdByInviteLink(String(data.group_link));
      if (resolved) {
        groupId = resolved;
        await supabase.from("whatsapp_groups").update({ group_id: groupId }).eq("id", data.id);
      }
    } catch (linkError) {
      const errorMsg = linkError instanceof Error ? linkError.message : String(linkError);
      console.error("Error al resolver group_id desde link:", linkError);
      throw new Error(`Error al resolver el link del grupo. Verificá que el link sea válido: ${errorMsg}`);
    }
  }
  if (!groupId) throw new Error("Falta group_id en el grupo. Agregá un link de invitación válido o el ID del grupo manualmente.");

  try {
    await whapiSendText({
      to: groupId,
      body: "Hola, grupo vinculado con éxito",
    });
  } catch (sendError) {
    const errorMsg = sendError instanceof Error ? sendError.message : String(sendError);
    throw new Error(`Error al enviar mensaje de prueba: ${errorMsg}`);
  }
}

export type PuntuacionRow = {
  cliente_numero: string;
  cliente_nombre?: string | null;
  puntuacion: number;
  comentario?: string | null;
  fecha: string; // ISO date
};

function excelSerialToDate(serial: number) {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms);
}

function parseFechaInput(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === "number" && Number.isFinite(value)) return excelSerialToDate(value);

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && raw.match(/^\d+(\.\d+)?$/)) {
    return excelSerialToDate(numeric);
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dmY = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmY) {
    const d = Number(dmY[1]);
    const m = Number(dmY[2]);
    const yRaw = Number(dmY[3]);
    const y = yRaw < 100 ? 2000 + yRaw : yRaw;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export async function adminUpsertPuntuaciones(params: { rows: PuntuacionRow[] }) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();

  if (!params.rows.length) return;

  const rows = params.rows
    .map((r) => {
      const fecha = parseFechaInput(r.fecha);
      if (!fecha) return null;
      return {
        cliente_numero: String(r.cliente_numero).trim(),
        cliente_nombre: r.cliente_nombre ?? null,
        puntuacion: Math.max(0, Math.min(5, Math.round(Number(r.puntuacion)))),
        comentario: r.comentario ?? null,
        fecha: fecha.toISOString(),
      };
    })
    .filter(
      (r): r is NonNullable<typeof r> =>
        Boolean(r && r.cliente_numero && Number.isFinite(r.puntuacion) && r.fecha),
    );

  if (!rows.length) throw new Error("No hay filas válidas para importar.");

  const { error } = await supabase.from("puntuaciones").insert(rows);
  if (error) throw new Error(error.message);

  const numeros = Array.from(new Set(rows.map((r) => r.cliente_numero)));

  for (const numero of numeros) {
    const { data: all, error: selectErr } = await supabase
      .from("puntuaciones")
      .select("id,fecha")
      .eq("cliente_numero", numero)
      .order("fecha", { ascending: false });
    if (selectErr) continue;
    if (!all || all.length <= 3) continue;
    const extras = all.slice(3).map((r) => r.id);
    if (extras.length) {
      await supabase.from("puntuaciones").delete().in("id", extras);
    }
  }
}

export async function adminClearPuntuaciones() {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();

  const { error, count } = await supabase
    .from("puntuaciones")
    .delete({ count: "exact" })
    .not("id", "is", null);

  if (error) throw new Error(error.message);
  return { deleted: typeof count === "number" ? count : null };
}

export async function adminClearClientes() {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();

  // 1. Crear o recuperar cliente genérico para conservar modulaciones
  // Usamos el número "0000" como reservado para el sistema.
  const { data: placeholder, error: placeholderErr } = await supabase
    .from("clientes")
    .upsert(
      {
        numero_cliente: "0000",
        nombre: "HISTORIAL (CLIENTE ELIMINADO)",
        domicilio: "—",
        zona: "SISTEMA",
      },
      { onConflict: "numero_cliente" },
    )
    .select("id")
    .single();

  if (placeholderErr || !placeholder) {
    throw new Error(
      `No se pudo crear el cliente genérico: ${placeholderErr?.message || "Error desconocido"}`,
    );
  }

  // 2. Reasignar todas las modulaciones al cliente genérico
  const { error: modErr } = await supabase
    .from("modulaciones")
    .update({ cliente_id: placeholder.id })
    .neq("cliente_id", placeholder.id);

  if (modErr) {
    throw new Error(`Error reasignando modulaciones: ${modErr.message}`);
  }

  // 3. Borrar todos los clientes EXCEPTO el genérico
  const { error: cliErr, count: cliCount } = await supabase
    .from("clientes")
    .delete({ count: "exact" })
    .neq("id", placeholder.id);

  if (cliErr) throw new Error(cliErr.message);

  return {
    clientesDeleted: typeof cliCount === "number" ? cliCount : null,
  };
}

export async function adminSearchCliente(params: { query: string }) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();

  const q = params.query.trim();
  if (!q) throw new Error("Ingresá un número de cliente o nombre");

  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .or(`numero_cliente.ilike.%${q}%,nombre.ilike.%${q}%`)
    .limit(10);

  if (error) throw new Error(error.message);

  return data ?? [];
}

export async function adminUpdateCliente(params: {
  id: string;
  numero_cliente: string;
  nombre: string | null;
  domicilio: string | null;
  telefono: string | null;
  vendedor: string | null;
  sv: string | null;
  zona: string | null;
}) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("clientes")
    .update({
      numero_cliente: params.numero_cliente,
      nombre: params.nombre,
      domicilio: params.domicilio,
      telefono: params.telefono,
      vendedor: params.vendedor,
      sv: params.sv,
      zona: params.zona,
    })
    .eq("id", params.id);

  if (error) throw new Error(error.message);

  return { success: true };
}

export async function adminDeleteModulacionesByMonth(params: { month: number; year: number }) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();

  const { month, year } = params;
  if (month < 1 || month > 12) throw new Error("Mes inválido");
  if (year < 2000) throw new Error("Año inválido");

  // Definir el rango del mes
  const startDate = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString();

  const { error, count } = await supabase
    .from("modulaciones")
    .delete({ count: "exact" })
    .gte("created_at", startDate)
    .lte("created_at", endDate);

  if (error) throw new Error(error.message);
  return { deleted: typeof count === "number" ? count : 0 };
}
