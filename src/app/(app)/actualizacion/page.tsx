"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { Clock, Star, Droplets, UserCheck, Timer, Calendar } from "lucide-react";
import {
  listModulacionesByDate,
  updateModulacionActualizacion,
} from "./actions";

type Row = {
  id: string;
  created_at: string;
  updated_at: string | null;
  cliente_numero: string;
  cliente_nombre: string | null;
  motivo: string | null;
  chofer: string | null;
  bultos: number | null;
  hl: number | null;
  comentario: string | null;
  actualizacion: "rechazado" | "pendiente" | "entregado" | null;
  created_by_email: string | null;
  puntuacion: number | null;
};

const OPTIONS: Array<NonNullable<Row["actualizacion"]>> = ["pendiente", "entregado", "rechazado"];

function Stars({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground/30 text-[10px]">Sin RMD</span>;
  const v = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={8} className={i < v ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground/30"} />
      ))}
    </div>
  );
}

export default function ActualizacionPage() {
  const env = useMemo(() => getSupabaseEnv(), []);
  const [clienteNumero, setClienteNumero] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<
    | { type: "idle" }
    | { type: "loading" }
    | { type: "error"; message: string }
    | { type: "done"; count: number }
  >({ type: "idle" });
  const [isPending, startTransition] = useTransition();

  const loadData = useCallback(async () => {
    try {
      setStatus({ type: "loading" });
      const data = await listModulacionesByDate({
        date: selectedDate
      });
      setAllRows(data as unknown as Row[]);
      setStatus({ type: "done", count: data.length });
    } catch (e) {
      setAllRows([]);
      setStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error al cargar modulaciones",
      });
    }
  }, [selectedDate]);

  // Cargar modulaciones cuando cambie el periodo
  useEffect(() => {
    if (env.missing.length) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [env.missing.length, loadData]);

  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      const matchNumero = !clienteNumero.trim() || r.cliente_numero.includes(clienteNumero.trim());
      const matchStatus = filterStatus === "todos" || (r.actualizacion || "pendiente") === filterStatus;
      return matchNumero && matchStatus;
    });
  }, [allRows, clienteNumero, filterStatus]);

  const mosaics = useMemo(() => {
    const pendientes = allRows.filter(r => (r.actualizacion || "pendiente") === "pendiente").length;
    
    const mas20Min = allRows.filter(r => {
      if (!r.updated_at || (r.actualizacion || "pendiente") === "pendiente") return false;
      const start = new Date(r.created_at).getTime();
      const end = new Date(r.updated_at).getTime();
      return (end - start) > 20 * 60 * 1000;
    }).length;

    const mas1Hl = allRows.filter(r => (r.hl || 0) > 1).length;
    
    const detractores = allRows.filter(r => r.puntuacion !== null && r.puntuacion <= 4).length;

    return [
      { label: "Pendientes", value: pendientes, icon: UserCheck, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" },
      { label: "+20 Minutos", value: mas20Min, icon: Timer, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30" },
      { label: "+1 Hectólitro", value: mas1Hl, icon: Droplets, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30" },
      { label: "Detractores (<=4)", value: detractores, icon: Star, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/30" },
    ];
  }, [allRows]);

  async function onUpdate(row: Row, value: NonNullable<Row["actualizacion"]>) {
    setStatus({ type: "loading" });
    try {
      await updateModulacionActualizacion({
        modulacionId: row.id,
        clienteNumero: row.cliente_numero,
        actualizacion: value,
      });
      // Actualizar localmente para evitar recargar todo
      setAllRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, actualizacion: value } : r))
      );
      setStatus({ type: "done", count: allRows.length });
    } catch (e) {
      setStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error al actualizar",
      });
    }
  }

  if (env.missing.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="text-lg font-semibold">Configurar Supabase</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Faltan variables de entorno: {env.missing.join(", ")}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      {/* Mosaicos de decisión */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {mosaics.map((m) => (
          <div key={m.label} className={`rounded-xl border border-border ${m.bg} p-4 shadow-sm transition-colors`}>
            <div className="flex items-center justify-between">
              <m.icon className={`h-5 w-5 ${m.color}`} />
              <span className={`text-2xl font-bold ${m.color.split(' ')[0]}`}>{m.value}</span>
            </div>
            <div className={`mt-1 text-[10px] font-bold uppercase leading-tight ${m.color.split(' ')[0]} opacity-80`}>
              {m.label}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4 border-b border-border pb-4">
          <div>
            <div className="text-base font-semibold">Actualización de modulaciones</div>
            <div className="text-xs text-muted-foreground">
              Consulta y gestiona estados del periodo.
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring min-w-[140px]"
            >
              <option value="todos">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="entregado">Entregado</option>
              <option value="rechazado">Rechazado</option>
            </select>

            <button
              type="button"
              onClick={() => void loadData()}
              disabled={isPending || status.type === "loading"}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-60"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
              Actualizar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 items-end">
          <div className="sm:col-span-8">
            <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
              Buscar Cliente
            </label>
            <input
              value={clienteNumero}
              onChange={(e) => setClienteNumero(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Nº de cliente"
              inputMode="numeric"
            />
          </div>
          <div className="sm:col-span-4">
            <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
              Filtrar por Día
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        {status.type === "loading" && (
          <div className="mt-4 text-center">
            <span className="text-xs text-muted-foreground animate-pulse">Cargando datos...</span>
          </div>
        )}

        {status.type === "error" ? (
          <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            {status.message}
          </div>
        ) : null}

        {filteredRows.length ? (
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border bg-card px-3 py-2 text-sm font-medium flex justify-between">
              <span>Modulaciones</span>
              <span className="text-muted-foreground font-normal text-xs">Total: {filteredRows.length}</span>
            </div>
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-background shadow-sm">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 whitespace-nowrap">Inicio / Fin</th>
                    <th className="px-3 py-2">Usuario</th>
                    <th className="px-3 py-2">Cliente / RMD</th>
                    <th className="px-3 py-2">Motivo</th>
                    <th className="px-3 py-2">Chofer</th>
                    <th className="px-3 py-2 text-center">Bultos / HL</th>
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2">
                        <div className="whitespace-nowrap">
                          {r.created_at ? new Date(r.created_at).toLocaleDateString("es-AR") : "—"}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock size={8} />
                          {r.created_at ? new Date(r.created_at).toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' }) : "—"}
                        </div>
                        {r.updated_at && (r.actualizacion !== "pendiente") && (
                          <div className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1 mt-0.5 border-t border-border/50 pt-0.5">
                            <UserCheck size={8} />
                            {new Date(r.updated_at).toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-[10px] font-medium text-blue-600 dark:text-blue-400 truncate max-w-[100px]" title={r.created_by_email ?? ""}>
                          {r.created_by_email?.split('@')[0] ?? "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-card-foreground">
                          {r.cliente_numero}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[120px]" title={r.cliente_nombre ?? ""}>
                          {r.cliente_nombre ?? "—"}
                        </div>
                        <div className="mt-1">
                          <Stars value={r.puntuacion} />
                        </div>
                      </td>
                      <td className="px-3 py-2 max-w-[100px] truncate" title={r.motivo ?? ""}>{r.motivo ?? "—"}</td>
                      <td className="px-3 py-2 max-w-[100px] truncate" title={r.chofer ?? ""}>{r.chofer ?? "—"}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="font-medium">{r.bultos ?? "0"}</div>
                        <div className="text-[10px] text-blue-500 font-bold">{r.hl ? `${r.hl} HL` : "0 HL"}</div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={r.actualizacion ?? "pendiente"}
                          onChange={(e) => {
                            const v = e.target.value as NonNullable<Row["actualizacion"]>;
                            startTransition(() => {
                              void onUpdate(r, v);
                            });
                          }}
                          className={`rounded-md border border-border px-2 py-1 text-[10px] font-medium outline-none focus:ring-2 focus:ring-ring ${
                            r.actualizacion === "entregado" ? "bg-green-100 text-green-800 border-green-200" :
                            r.actualizacion === "rechazado" ? "bg-red-100 text-red-800 border-red-200" :
                            "bg-amber-100 text-amber-800 border-amber-200"
                          }`}
                        >
                          {OPTIONS.map((opt) => (
                            <option key={String(opt)} value={String(opt)}>
                              {opt.charAt(0).toUpperCase() + opt.slice(1)}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : status.type === "done" ? (
          <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground text-center py-8">
            <p>No se encontraron modulaciones con los filtros aplicados.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
