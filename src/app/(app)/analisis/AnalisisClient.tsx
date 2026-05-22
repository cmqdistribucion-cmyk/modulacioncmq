"use client";

import { useEffect, useState, useTransition, useMemo } from "react";
import { getAnalisisData } from "./actions";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
} from "recharts";
import { Calendar, ChartBar, TrendingDown, RefreshCcw } from "lucide-react";

type RawData = { created_at: string; actualizacion: string | null };

export function AnalisisClient() {
  const [data, setData] = useState<RawData[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const refresh = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await getAnalisisData({
          from: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
          to: dateTo ? `${dateTo}T23:59:59Z` : undefined,
        });
        setData(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar datos");
      }
    });
  };

  useEffect(() => {
    refresh();
  }, [dateFrom, dateTo]);

  const stats = useMemo(() => {
    const monthly: Record<string, { total: number; rechazados: number }> = {};

    data.forEach((r) => {
      const date = new Date(r.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!monthly[key]) monthly[key] = { total: 0, rechazados: 0 };
      monthly[key].total++;
      if (r.actualizacion === "rechazado") {
        monthly[key].rechazados++;
      }
    });

    const chartData = Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => {
        const [y, m] = key.split("-");
        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        const name = `${monthNames[parseInt(m) - 1]} ${y}`;
        const pctRechazo = val.total > 0 ? (val.rechazados / val.total) * 100 : 0;
        return {
          key,
          name,
          total: val.total,
          rechazados: val.rechazados,
          pctRechazo: parseFloat(pctRechazo.toFixed(1)),
        };
      });

    const totalMod = data.length;
    const totalRechazados = data.filter((r) => r.actualizacion === "rechazado").length;
    const globalPct = totalMod > 0 ? (totalRechazados / totalMod) * 100 : 0;

    return { chartData, totalMod, totalRechazados, globalPct };
  }, [data]);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="text-lg font-semibold">Análisis de Datos</div>
            <div className="text-sm text-muted-foreground">
              Estadísticas de modulaciones y calidad de entrega.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-transparent text-sm outline-none"
              />
              <span className="text-muted-foreground">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-transparent text-sm outline-none"
              />
            </div>
            <button
              onClick={refresh}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              <RefreshCcw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <ChartBar className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium text-muted-foreground">Total Modulaciones</div>
          </div>
          <div className="mt-3 text-3xl font-bold">{stats.totalMod}</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-red-100 p-2 text-red-600 dark:bg-red-900/30 dark:text-red-400">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium text-muted-foreground">Total Rechazos</div>
          </div>
          <div className="mt-3 text-3xl font-bold text-red-600">{stats.totalRechazados}</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-orange-100 p-2 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
              <span className="text-lg font-bold">%</span>
            </div>
            <div className="text-sm font-medium text-muted-foreground">% de Rechazo Global</div>
          </div>
          <div className="mt-3 text-3xl font-bold text-orange-600">
            {stats.globalPct.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-6 text-base font-semibold">Modulaciones por Mes</div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                />
                <Legend />
                <Bar dataKey="total" name="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rechazados" name="Rechazos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-6 text-base font-semibold">Tendencia % de Rechazo</div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} unit="%" />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                  formatter={(value) => [`${value}%`, "% Rechazo"]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="pctRechazo"
                  name="% Rechazo"
                  stroke="#f97316"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#f97316" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
