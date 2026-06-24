"use client";

import {
  adminCreateUser,
  adminGenerateRecoveryLink,
  adminListUsers,
  adminSetPassword,
  adminSetRole,
  adminUpsertPuntuaciones,
  adminDeleteModulacionesByMonth,
} from "./actions";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ExportModulaciones } from "@/components/export-modulaciones";
import * as XLSX from "xlsx";

type UserRow = Awaited<ReturnType<typeof adminListUsers>>[number];

export function AdminClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openGestion, setOpenGestion] = useState<boolean>(false);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "usuario">("usuario");

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const selected = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const [resetPassword, setResetPassword] = useState("");
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  const refresh = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const list = await adminListUsers();
        setUsers(list);
        if (selectedUserId && !list.some((u) => u.id === selectedUserId)) {
          setSelectedUserId("");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar usuarios");
      }
    });
  }, [selectedUserId]);

  useEffect(() => {
    const id = window.setTimeout(() => refresh(), 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  async function onCreateUser() {
    setError(null);
    setRecoveryLink(null);
    startTransition(async () => {
      try {
        await adminCreateUser({
          email: newEmail,
          password: newPassword,
          role: newRole,
        });
        setNewEmail("");
        setNewPassword("");
        setNewRole("usuario");
        notify("Usuario creado");
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al crear usuario");
      }
    });
  }

  async function onSetPassword() {
    if (!selected) return;
    setError(null);
    setRecoveryLink(null);
    startTransition(async () => {
      try {
        await adminSetPassword({ userId: selected.id, password: resetPassword });
        setResetPassword("");
        notify("Contraseña actualizada");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al resetear clave");
      }
    });
  }

  async function onGenerateLink() {
    if (!selected?.email) return;
    setError(null);
    startTransition(async () => {
      try {
        const { actionLink } = await adminGenerateRecoveryLink({
          email: selected.email ?? "",
        });
        setRecoveryLink(actionLink);
        await navigator.clipboard.writeText(actionLink);
        notify("Link copiado");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al generar link");
      }
    });
  }

  async function onSetRole(role: "admin" | "usuario") {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      try {
        await adminSetRole({ userId: selected.id, role });
        notify("Rol actualizado");
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al asignar rol");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">Panel Admin</div>
            <div className="text-sm text-muted-foreground">
              Crear usuarios, resetear clave y asignar roles.
            </div>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
          >
            {loading ? "Cargando..." : "Actualizar"}
          </button>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => setOpenGestion((v) => !v)}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
          >
            {openGestion ? "Ocultar actualizaciones" : "Actualizaciones de datos"}
          </button>
        </div>

        {openGestion ? (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-sm font-semibold">Accesos rápidos</div>
              <div className="mt-2 flex flex-col gap-2">
                <Link
                  href="/import"
                  className="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
                >
                  Importar clientes
                </Link>
                <Link
                  href="/listas"
                  className="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
                >
                  Choferes/Motivos
                </Link>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-sm font-semibold">Exportar modulaciones</div>
              <div className="mt-2">
                <ExportModulaciones />
              </div>
            </div>

            <DeleteModulacionesCard />
            <ImportPuntuaciones onImported={() => notify("Puntuaciones cargadas")} />
          </div>
        ) : null}

        {toast ? (
          <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            {toast}
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            {error}
          </div>
        ) : null}
      </div>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-base font-semibold">Crear usuario</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Se crea con email confirmado.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            type="email"
            placeholder="email@empresa.com"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type="password"
            placeholder="Contraseña"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as "admin" | "usuario")}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="usuario">Usuario</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={onCreateUser}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
          >
            Crear usuario
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-base font-semibold">Usuarios</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Seleccioná un usuario para administrar.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border bg-card px-3 py-2 text-sm font-medium">
              Lista
            </div>
            <div className="max-h-96 overflow-auto">
              {users.length ? (
                users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUserId(u.id);
                      setRecoveryLink(null);
                      setResetPassword("");
                    }}
                    className={`flex w-full items-start justify-between gap-3 px-3 py-3 text-left hover:bg-muted ${
                      selectedUserId === u.id ? "bg-muted" : "bg-card"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {u.email ?? "(sin email)"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {u.id}
                      </div>
                    </div>
                    <div className="shrink-0 text-xs text-muted-foreground">
                      {u.role}
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  Sin usuarios.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            {selected ? (
              <div className="flex flex-col gap-4">
                <div>
                  <div className="text-sm font-semibold">Seleccionado</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {selected.email ?? "(sin email)"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {selected.id}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Rol: {selected.role}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onSetRole("usuario")}
                    disabled={loading}
                    className="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                  >
                    Hacer usuario
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetRole("admin")}
                    disabled={loading}
                    className="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                  >
                    Hacer admin
                  </button>
                </div>

                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-sm font-semibold">Resetear clave</div>
                  <div className="mt-2 flex flex-col gap-2">
                    <input
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      type="password"
                      placeholder="Nueva contraseña"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={onSetPassword}
                      disabled={loading || !resetPassword}
                      className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
                    >
                      Actualizar contraseña
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-sm font-semibold">
                    Link de recuperación (email)
                  </div>
                  <div className="mt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={onGenerateLink}
                      disabled={loading || !selected.email}
                      className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
                    >
                      Generar y copiar link
                    </button>
                    {recoveryLink ? (
                      <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                        {recoveryLink}
                      </pre>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Seleccioná un usuario a la izquierda.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function DeleteModulacionesCard() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message?: string }>({ type: "idle" });

  const months = [
    { value: 1, label: "Enero" },
    { value: 2, label: "Febrero" },
    { value: 3, label: "Marzo" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Mayo" },
    { value: 6, label: "Junio" },
    { value: 7, label: "Julio" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Septiembre" },
    { value: 10, label: "Octubre" },
    { value: 11, label: "Noviembre" },
    { value: 12, label: "Diciembre" },
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  async function handleDelete() {
    if (!confirm(`¿Estás seguro de eliminar las modulaciones de ${months.find(m => m.value === month)?.label} ${year}? Esta acción no se puede deshacer.`)) {
      return;
    }

    startTransition(async () => {
      try {
        const res = await adminDeleteModulacionesByMonth({ month, year });
        setStatus({ type: "success", message: `Se eliminaron ${res.deleted} modulaciones.` });
        setTimeout(() => setStatus({ type: "idle" }), 3000);
      } catch (e) {
        setStatus({ type: "error", message: e instanceof Error ? e.message : "Error al eliminar" });
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="text-sm font-semibold text-red-600 dark:text-red-400">Limpiar modulaciones</div>
      <div className="mt-1 text-xs text-muted-foreground">
        Elimina permanentemente las modulaciones de un mes específico.
      </div>
      
      <div className="mt-3 grid grid-cols-2 gap-2">
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-60 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
      >
        {isPending ? "Eliminando..." : "Eliminar modulaciones"}
      </button>

      {status.type !== "idle" && (
        <div className={`mt-2 rounded-md px-2 py-1.5 text-[10px] ${status.type === "success" ? "bg-green-50 text-green-600 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30" : "bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30"}`}>
          {status.message}
        </div>
      )}
    </div>
  );
}

function ImportPuntuaciones({ onImported }: { onImported: () => void }) {
  const [status, setStatus] = useState<
    | { type: "idle" }
    | { type: "parsing" }
    | { type: "ready"; count: number }
    | { type: "uploading"; uploaded: number; total: number }
    | { type: "done"; count: number }
    | { type: "error"; message: string }
  >({ type: "idle" });
  const [rows, setRows] = useState<Awaited<ReturnType<typeof parseFile>> | null>(null);

  async function parseFile(file: File) {
    setStatus({ type: "parsing" });
    try {
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      const workbook = isCsv
        ? XLSX.read(await file.text(), { type: "string" })
        : XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) throw new Error("No pude leer el archivo.");
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: true,
      });
      if (!json.length) throw new Error("El archivo está vacío.");

      function norm(s: string) {
        return s
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replaceAll(/[\u0300-\u036f]/g, "")
          .replaceAll(/[^a-z0-9]/g, "");
      }

      const headers = Object.keys(json[0] ?? {});
      const map: Record<string, keyof import("./actions").PuntuacionRow | null> = {};
      for (const h of headers) {
        const k = norm(h);
        if (k.includes("numero") && k.includes("cliente")) map[h] = "cliente_numero";
        else if (k === "nombre" || k.includes("cliente")) map[h] = "cliente_nombre";
        else if (k.includes("puntuacion") || k.includes("puntaje")) map[h] = "puntuacion";
        else if (k === "comentario" || k.includes("observacion")) map[h] = "comentario";
        else if (k === "fecha" || k.includes("fechapuntuacion")) map[h] = "fecha";
        else map[h] = null;
      }

      const out = json
        .map((r) => {
          const row: Partial<import("./actions").PuntuacionRow> = {};
          for (const [h, dest] of Object.entries(map)) {
            if (!dest) continue;
            const val = r[h];
            switch (dest) {
              case "cliente_numero":
                row.cliente_numero = String(val ?? "");
                break;
              case "cliente_nombre":
                row.cliente_nombre = String(val ?? "") || null;
                break;
              case "puntuacion":
                row.puntuacion = Number(val);
                break;
              case "comentario":
                row.comentario = String(val ?? "") || null;
                break;
              case "fecha":
                row.fecha = String(val ?? "");
                break;
            }
          }
          const numero = String(row.cliente_numero ?? "").trim();
          const puntuacion = Number(row.puntuacion);
          const fecha = String(row.fecha ?? "");
          if (!numero || !Number.isFinite(puntuacion) || !fecha) return null;
          return {
            cliente_numero: numero,
            cliente_nombre: String(row.cliente_nombre ?? "") || null,
            puntuacion,
            comentario: row.comentario ?? null,
            fecha,
          } as import("./actions").PuntuacionRow;
        })
        .filter(Boolean) as import("./actions").PuntuacionRow[];

      setRows(out);
      setStatus({ type: "ready", count: out.length });
      return out;
    } catch (e) {
      setRows(null);
      setStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error al leer archivo",
      });
      return null;
    }
  }

  function upload() {
    if (!rows?.length) return;
    setStatus({ type: "uploading", uploaded: 0, total: 1 });
    (async () => {
      try {
        await adminUpsertPuntuaciones({ rows });
        setStatus({ type: "done", count: rows.length });
        onImported();
      } catch (e) {
        setStatus({
          type: "error",
          message: e instanceof Error ? e.message : "Error al subir",
        });
      }
    })();
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4 md:col-span-2">
      <div className="text-sm font-semibold">Importar puntuaciones (últimas 3)</div>
      <div className="mt-1 text-sm text-muted-foreground">
        Excel/CSV con columnas: Nº de cliente, Nombre del cliente, Puntuación (0-5), Fecha.
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted">
          <input
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.currentTarget.value = "";
              if (f) void parseFile(f);
            }}
          />
          Seleccionar archivo
        </label>
        <button
          type="button"
          onClick={upload}
          disabled={status.type !== "ready"}
          className="inline-flex items-center justify-center rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
        >
          Subir
        </button>
      </div>
      {status.type === "ready" ? (
        <div className="mt-2 text-sm text-muted-foreground">{status.count} filas listas</div>
      ) : null}
      {status.type === "error" ? (
        <div className="mt-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {status.message}
        </div>
      ) : null}
      {status.type === "done" ? (
        <div className="mt-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Importación finalizada.
        </div>
      ) : null}
    </div>
  );
}
