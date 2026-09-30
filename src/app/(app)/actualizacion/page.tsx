"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { Clock, Star, Droplets, UserCheck, Timer, Calendar, X, Check, Bot } from "lucide-react";
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
  pdv_critico_chofer: string | null;
  feedback_pdv: string | null;
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
  const [activeMosaic, setActiveMosaic] = useState<string | null>(null);
  const [showAiAviso, setShowAiAviso] = useState(true);
  
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [now, setNow] = useState(Date.now());

  // Actualizar el tiempo actual cada minuto para los cálculos de "+20 min"
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

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
    
    let active = true;
    const load = async () => {
      try {
        setStatus({ type: "loading" });
        const data = await listModulacionesByDate({
          date: selectedDate
        });
        if (!active) return;
        setAllRows(data as unknown as Row[]);
        setStatus({ type: "done", count: data.length });
      } catch (e) {
        if (!active) return;
        // Ignorar errores de cancelación/abort
        if (e instanceof Error && (e.message.includes("abort") || e.message.includes("cancelled"))) return;
        
        setAllRows([]);
        setStatus({
          type: "error",
          message: e instanceof Error ? e.message : "Error al cargar modulaciones",
        });
      }
    };

    void load();
    return () => { active = false; };
  }, [env.missing.length, selectedDate]);

  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      const matchNumero = !clienteNumero.trim() || r.cliente_numero.includes(clienteNumero.trim());
      const matchStatus = filterStatus === "todos" || (r.actualizacion || "pendiente") === filterStatus;
      
      let matchMosaic = true;
      if (activeMosaic === "Pendientes") {
        matchMosaic = (r.actualizacion || "pendiente") === "pendiente";
      } else if (activeMosaic === "+20 Minutos") {
        if (r.actualizacion === "entregado") {
          matchMosaic = false;
        } else {
          const start = new Date(r.created_at).getTime();
          const isFinished = (r.actualizacion || "pendiente") !== "pendiente";
          const end = isFinished 
            ? (r.updated_at ? new Date(r.updated_at).getTime() : start)
            : now;
          matchMosaic = (end - start) > 20 * 60 * 1000;
        }
      } else if (activeMosaic === "+1 Hectólitro") {
        matchMosaic = (r.actualizacion || "pendiente") === "pendiente" && (r.hl || 0) > 1;
      } else if (activeMosaic === "Detractores (<=4)") {
        matchMosaic = (r.actualizacion || "pendiente") === "pendiente" && r.puntuacion !== null && r.puntuacion <= 4;
      }

      return matchNumero && matchStatus && matchMosaic;
    });
  }, [allRows, clienteNumero, filterStatus, activeMosaic, now]);

  const mosaics = useMemo(() => {
    const pendingItems = allRows.filter(r => (r.actualizacion || "pendiente") === "pendiente");
    const pendientes = pendingItems.length;
    const oldestPending = pendingItems.length > 0 
      ? Math.min(...pendingItems.map(r => new Date(r.created_at).getTime()))
      : null;
    const maxMinutes = oldestPending ? Math.floor((now - oldestPending) / 60000) : 0;
    
    const mas20Min = allRows.filter(r => {
        if (r.actualizacion === "entregado") return false;
      const start = new Date(r.created_at).getTime();
      const isFinished = (r.actualizacion || "pendiente") !== "pendiente";
      const end = isFinished 
        ? (r.updated_at ? new Date(r.updated_at).getTime() : start)
        : now;
      return (end - start) > 20 * 60 * 1000;
    }).length;

    const mas1Hl = pendingItems.filter(r => (r.hl || 0) > 1).length;
    
    const detractores = pendingItems.filter(r => r.puntuacion !== null && r.puntuacion <= 4).length;

    return {
      stats: { pendientes, maxMinutes },
      items: [
        { label: "Pendientes", value: pendientes, icon: UserCheck, color: "text-black", bg: "bg-[#FFEC8B]", border: "border-amber-200" },
        { label: "+20 Minutos", value: mas20Min, icon: Timer, color: "text-black", bg: "bg-[#FFFACD]", border: "border-yellow-200" },
        { label: "+1 Hectólitro", value: mas1Hl, icon: Droplets, color: "text-black", bg: "bg-[#FF9999]", border: "border-red-300" },
        { label: "Detractores (<=4)", value: detractores, icon: Star, color: "text-black", bg: "bg-[#FFCC80]", border: "border-orange-300" },
      ]
    };
  }, [allRows, now]);

  async function onUpdate(row: Row, value: NonNullable<Row["actualizacion"]>) {
    setStatus({ type: "loading" });
    try {
      await updateModulacionActualizacion({
        modulacionId: row.id,
        clienteNumero: row.cliente_numero,
        actualizacion: value,
      });
      // Actualizar localmente para evitar recargar todo
      const nowTs = new Date().toISOString();
      setAllRows((prev) =>
        prev.map((r): Row => (r.id === row.id ? { ...r, actualizacion: value, updated_at: nowTs } : r))
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
      {/* Aviso de la IA (Robot) */}
      {showAiAviso && mosaics.stats.pendientes > 0 && (
        <div className="relative flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 pr-10 shadow-sm dark:border-blue-800 dark:bg-blue-900/20 animate-in slide-in-from-top duration-300">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-800">
            <Bot className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              ¡Hola! Tenés <span className="font-bold">{mosaics.stats.pendientes}</span> {mosaics.stats.pendientes === 1 ? 'pendiente' : 'pendientes'} y el más antiguo lleva <span className="font-bold">{mosaics.stats.maxMinutes}</span> {mosaics.stats.maxMinutes === 1 ? 'minuto' : 'minutos'}.
            </p>
          </div>
          <button
            onClick={() => setShowAiAviso(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-blue-400 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-800"
            title="Cerrar aviso"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Mosaicos de decisión */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {mosaics.items.map((m) => (
          <button
            key={m.label}
            onClick={() => setActiveMosaic(activeMosaic === m.label ? null : m.label)}
            className={`group relative text-left rounded-xl border p-4 shadow-sm transition-all active:scale-95 ${m.bg} ${m.border} ${
              activeMosaic === m.label 
                ? `ring-2 ring-ring ring-offset-2` 
                : `opacity-90 hover:opacity-100`
            }`}
          >
            <div className="flex items-center justify-between">
              <m.icon className={`h-5 w-5 transition-colors ${
                activeMosaic === m.label ? m.color : "text-muted-foreground group-hover:" + m.color
              }`} />
              <span className={`text-2xl font-bold transition-colors ${
                activeMosaic === m.label ? m.color : "text-card-foreground"
              }`}>{m.value}</span>
            </div>
            <div className={`mt-1 text-[10px] font-bold uppercase leading-tight transition-colors ${
              activeMosaic === m.label ? m.color : "text-muted-foreground"
            } opacity-80`}>
              {m.label}
            </div>
            {activeMosaic === m.label && (
              <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background">
                <Check size={8} strokeWidth={4} />
              </div>
            )}
          </button>
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
            <div className="border-b border-border bg-card px-3 py-2 text-sm font-medium flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span>Modulaciones</span>
                {activeMosaic && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    mosaics.items.find(m => m.label === activeMosaic)?.bg
                  } ${mosaics.items.find(m => m.label === activeMosaic)?.color}`}>
                    Filtrado por: {activeMosaic}
                    <button onClick={() => setActiveMosaic(null)} className="ml-1.5 hover:opacity-70">
                      <X size={10} strokeWidth={3} />
                    </button>
                  </span>
                )}
              </div>
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
                    <th className="px-3 py-2">PDV Crítico Chofer</th>
                    <th className="px-3 py-2">Feedback PDV</th>
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2">
                        <div className="whitespace-nowrap font-medium">
                          {r.created_at ? new Date(r.created_at).toLocaleDateString("es-AR") : "—"}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock size={8} />
                          {r.created_at ? new Date(r.created_at).toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' }) : "—"}
                          {(r.actualizacion || "pendiente") === "pendiente" && (now - new Date(r.created_at).getTime() > 20 * 60 * 1000) && (
                            <span className="ml-1 inline-flex items-center gap-0.5 text-red-600 dark:text-red-400 font-bold animate-pulse">
                              <Timer size={8} />
                              +{Math.floor((now - new Date(r.created_at).getTime()) / 60000)}m
                            </span>
                          )}
                        </div>
                        {r.updated_at && (r.actualizacion !== "pendiente") && (
                          <div className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1 mt-0.5 border-t border-border/50 pt-0.5">
                            <UserCheck size={8} />
                            {new Date(r.updated_at).toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' })}
                            <span className="ml-auto text-[8px] opacity-70">
                              {Math.floor((new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 60000)}m
                            </span>
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
                        <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">{r.hl ? `${r.hl} HL` : "0 HL"}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-[10px] font-medium text-orange-600 dark:text-orange-400 truncate max-w-[100px]" title={r.pdv_critico_chofer ?? ""}>
                          {r.pdv_critico_chofer ?? "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-[10px] font-medium text-green-600 dark:text-green-400 truncate max-w-[100px]" title={r.feedback_pdv ?? ""}>
                          {r.feedback_pdv ?? "—"}
                        </div>
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
                          className={`rounded-md border border-border px-2 py-1 text-[10px] font-bold outline-none focus:ring-2 focus:ring-ring transition-colors ${
                            r.actualizacion === "entregado" ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" :
                            r.actualizacion === "rechazado" ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800" :
                            "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
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
            {activeMosaic && (
              <button 
                onClick={() => setActiveMosaic(null)}
                className="mt-2 text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline"
              >
                Limpiar filtro de mosaico
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
