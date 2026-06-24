"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adminDeleteWhatsappGroup,
  adminListWhatsappGroups,
  adminResolveWhatsappGroupIdFromLink,
  adminTestWhatsappGroup,
  adminUpsertWhatsappGroup,
  type WhatsappGroupRow,
} from "../admin/actions";
import {
  getAutoStatusConfig,
  saveAutoStatusConfig,
  runAutoStatusUpdate,
} from "./autoStatusActions";

export function ConfiguracionClient() {
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-base font-semibold">Configuración del sistema</div>
        <div className="text-sm text-muted-foreground">
          Gestión de grupos de WhatsApp y otros ajustes generales.
        </div>
        <div className="mt-6 grid grid-cols-1 gap-6">
          <AutoStatusCard />
          <WhatsappGroupsCard />
        </div>
      </div>
    </div>
  );
}

function AutoStatusCard() {
  const [status, setStatus] = useState<
    | { type: "idle" }
    | { type: "loading" }
    | { type: "error"; message: string }
    | { type: "done" }
  >({ type: "idle" });
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(21);
  const [toast, setToast] = useState<string | null>(null);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  const refresh = useCallback(async () => {
    setStatus({ type: "loading" });
    try {
      const config = await getAutoStatusConfig();
      setEnabled(config.enabled);
      setHour(config.hour);
      setStatus({ type: "done" });
    } catch (e) {
      setStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error al cargar configuración",
      });
    }
  }, []);

  async function save() {
    setStatus({ type: "loading" });
    try {
      await saveAutoStatusConfig({ enabled, hour });
      notify("Configuración guardada");
      setStatus({ type: "done" });
    } catch (e) {
      setStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error al guardar",
      });
    }
  }

  async function runNow() {
    setStatus({ type: "loading" });
    try {
      const result = await runAutoStatusUpdate();
      notify(result.message);
      setStatus({ type: "done" });
    } catch (e) {
      setStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error al ejecutar",
      });
    }
  }

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Cambio automático de estado</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Cambia todas las modulaciones pendientes a "Entregado" a la hora configurada.
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
          disabled={status.type === "loading"}
        >
          {status.type === "loading" ? "Cargando..." : "Actualizar"}
        </button>
      </div>

      {toast ? (
        <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {toast}
        </div>
      ) : null}

      {status.type === "error" ? (
        <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {status.message}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="inline-flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span>Activar cambio automático</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        </label>
        <div>
          <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">
            Hora
          </label>
          <input
            type="number"
            min="0"
            max="23"
            value={hour}
            onChange={(e) => setHour(parseInt(e.target.value, 10) || 21)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="md:col-span-1 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={status.type === "loading"}
            className="inline-flex w-full items-center justify-center rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
          >
            Guardar configuración
          </button>
          <button
            type="button"
            onClick={() => void runNow()}
            disabled={status.type === "loading"}
            className="inline-flex w-full items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
          >
            Ejecutar ahora
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        <strong>Configuración:</strong><br/>
        Haz clic en "Ejecutar ahora" para cambiar manualmente TODAS las modulaciones pendientes a "Entregado".
      </div>
    </div>
  );
}

function WhatsappGroupsCard() {
  const [status, setStatus] = useState<
    | { type: "idle" }
    | { type: "loading" }
    | { type: "error"; message: string }
    | { type: "done" }
  >({ type: "idle" });
  const [groups, setGroups] = useState<WhatsappGroupRow[]>([]);
  const [editId, setEditId] = useState<string>("");
  const [supervisorName, setSupervisorName] = useState("");
  const [groupLink, setGroupLink] = useState("");
  const [groupId, setGroupId] = useState("");
  const [active, setActive] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  const refresh = useCallback(async () => {
    setStatus({ type: "loading" });
    try {
      const list = await adminListWhatsappGroups();
      setGroups(list);
      setStatus({ type: "done" });
    } catch (e) {
      setGroups([]);
      setStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error al cargar grupos",
      });
    }
  }, []);

  async function save() {
    setStatus({ type: "loading" });
    try {
      await adminUpsertWhatsappGroup({
        id: editId || undefined,
        supervisor_name: supervisorName,
        group_link: groupLink || null,
        group_id: groupId || null,
        active,
      });
      setEditId("");
      setSupervisorName("");
      setGroupLink("");
      setGroupId("");
      setActive(true);
      notify("Guardado");
      await refresh();
    } catch (e) {
      setStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error al guardar",
      });
    }
  }

  async function resolveIdFromLink() {
    if (!groupLink.trim()) return;
    setStatus({ type: "loading" });
    try {
      const { group_id } = await adminResolveWhatsappGroupIdFromLink({ group_link: groupLink });
      setGroupId(group_id);
      notify("ID obtenido");
      setStatus({ type: "done" });
    } catch (e) {
      setStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error al obtener ID",
      });
    }
  }

  async function onDelete(id: string) {
    const ok = window.confirm("¿Eliminar este grupo?");
    if (!ok) return;
    setStatus({ type: "loading" });
    try {
      await adminDeleteWhatsappGroup({ id });
      notify("Eliminado");
      await refresh();
    } catch (e) {
      setStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error al eliminar",
      });
    }
  }

  async function onTest(id: string) {
    setStatus({ type: "loading" });
    try {
      await adminTestWhatsappGroup({ id });
      notify("Test enviado");
      setStatus({ type: "done" });
    } catch (e) {
      setStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error en test",
      });
    }
  }

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Grupos WhatsApp por Supervisor (SV)</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Se usa para envío automático al modular. Recomendado: completar group_id (ej:
            120363...@g.us).
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
          disabled={status.type === "loading"}
        >
          {status.type === "loading" ? "Cargando..." : "Actualizar"}
        </button>
      </div>

      {toast ? (
        <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {toast}
        </div>
      ) : null}

      {status.type === "error" ? (
        <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap">
          {status.message}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
        <input
          value={supervisorName}
          onChange={(e) => setSupervisorName(e.target.value)}
          placeholder="Supervisor (SV)"
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring md:col-span-2"
        />
        <input
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          placeholder="group_id (requerido para envío)"
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring md:col-span-2"
        />
        <label className="inline-flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span>Activo</span>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
        </label>
        <input
          value={groupLink}
          onChange={(e) => setGroupLink(e.target.value)}
          placeholder="group_link (opcional)"
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring md:col-span-4"
        />
        <div className="md:col-span-1">
          <button
            type="button"
            onClick={() => void save()}
            disabled={status.type === "loading"}
            className="inline-flex w-full items-center justify-center rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
          >
            {editId ? "Actualizar" : "Agregar"}
          </button>
          <button
            type="button"
            onClick={() => void resolveIdFromLink()}
            disabled={status.type === "loading" || !groupLink.trim()}
            className="mt-2 inline-flex w-full items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
          >
            Obtener ID desde link
          </button>
        </div>
      </div>

      {groups.length ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border bg-card px-3 py-2 text-sm font-medium">
            Lista ({groups.length})
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-border">
                  <th className="px-3 py-2">Supervisor</th>
                  <th className="px-3 py-2">group_id</th>
                  <th className="px-3 py-2">Activo</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id} className="border-b border-border">
                    <td className="px-3 py-2">{g.supervisor_name}</td>
                    <td className="px-3 py-2 break-all">{g.group_id ?? "—"}</td>
                    <td className="px-3 py-2">{g.active ? "Sí" : "No"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditId(g.id);
                            setSupervisorName(g.supervisor_name);
                            setGroupLink(g.group_link ?? "");
                            setGroupId(g.group_id ?? "");
                            setActive(Boolean(g.active));
                          }}
                          className="inline-flex items-center justify-center rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void onTest(g.id)}
                          className="inline-flex items-center justify-center rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted"
                        >
                          Test
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDelete(g.id)}
                          className="inline-flex items-center justify-center rounded-md border border-border bg-card px-2 py-1 text-xs text-red-600 hover:bg-muted"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : status.type === "done" ? (
        <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Sin grupos cargados.
        </div>
      ) : null}
    </div>
  );
}
