"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import * as XLSX from "xlsx";
import { useMemo, useState } from "react";

export function ExportModulaciones() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [open, setOpen] = useState<boolean>(false);
  const [status, setStatus] = useState<
    | { type: "idle" }
    | { type: "loading" }
    | { type: "error"; message: string }
    | { type: "done"; count: number }
  >({ type: "idle" });

  async function onExport() {
    setStatus({ type: "loading" });
    try {
      const pageSize = 1000;
      const allRows: Array<Record<string, unknown>> = [];
      let legacySelect = false;

      for (let page = 0; page < 200; page++) {
        const rangeFrom = page * pageSize;
        const rangeTo = rangeFrom + pageSize - 1;

        const selectNew =
          "id,created_at,created_by,created_by_email,actualizacion,cliente_numero,cliente_nombre,zona,vendedor,sv,motivo,chofer,bultos,hl,comentario";
        const selectOld =
          "id,created_at,created_by,cliente_numero,cliente_nombre,zona,vendedor,sv,motivo,chofer,bultos,hl,comentario";

        const baseQuery = legacySelect
          ? supabase.from("modulaciones").select(selectOld)
          : supabase.from("modulaciones").select(selectNew);
        let query = baseQuery.order("created_at", { ascending: false });

        if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
        if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

        let { data, error } = await query.range(rangeFrom, rangeTo);
        if (error && !legacySelect) {
          const msg = error.message.toLowerCase();
          const missingColumn =
            msg.includes("actualizacion") ||
            msg.includes("created_by_email") ||
            msg.includes("could not find the") ||
            msg.includes("does not exist");
          if (missingColumn) {
            legacySelect = true;
            query = supabase
              .from("modulaciones")
              .select(selectOld)
              .order("created_at", { ascending: false });
            if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
            if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);
            ({ data, error } = await query.range(rangeFrom, rangeTo));
          }
        }
        if (error) throw new Error(error.message);

        const rows = (data ?? []) as Array<Record<string, unknown>>;
        allRows.push(...rows);
        if (rows.length < pageSize) break;
      }

      const exportData = allRows.map((r) => ({
        Fecha: r.created_at ?? "",
        "Nº Cliente": r.cliente_numero ?? "",
        Cliente: r.cliente_nombre ?? "",
        Zona: r.zona ?? "",
        Vendedor: r.vendedor ?? "",
        SV: r.sv ?? "",
        Motivo: r.motivo ?? "",
        Chofer: r.chofer ?? "",
        Bultos: r.bultos ?? "",
        Hectolitros: r.hl ?? "",
        Comentario: r.comentario ?? "",
        Actualización: r.actualizacion ?? "",
        Usuario: r.created_by_email ?? "",
        "Usuario ID": r.created_by ?? "",
        ID: r.id ?? "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Modulaciones");

      const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([arrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      const suffix =
        from || to ? `${from || "0000-00-00"}_a_${to || "0000-00-00"}` : `${y}-${m}-${d}`;
      const fileName = `modulaciones_${suffix}.xlsx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setStatus({ type: "done", count: exportData.length });
      window.setTimeout(() => setStatus({ type: "idle" }), 2500);
    } catch (e) {
      setStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error al exportar",
      });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={status.type === "loading"}
        className="inline-flex w-full items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-card-foreground shadow-sm hover:bg-muted disabled:opacity-60 sm:w-auto"
      >
        Exportar modulaciones
      </button>
      {open ? (
        <>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring sm:w-auto"
            aria-label="Desde"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring sm:w-auto"
            aria-label="Hasta"
          />
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const y = now.getFullYear();
              const m = String(now.getMonth() + 1).padStart(2, "0");
              const d = String(now.getDate()).padStart(2, "0");
              const today = `${y}-${m}-${d}`;
              setFrom(today);
              setTo(today);
            }}
            className="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-card-foreground shadow-sm hover:bg-muted"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={status.type === "loading"}
            className="inline-flex items-center justify-center rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
          >
            {status.type === "loading" ? "Exportando..." : "Descargar"}
          </button>
        </>
      ) : null}
      {status.type === "error" ? (
        <div className="w-full text-xs text-muted-foreground sm:w-auto">Error</div>
      ) : status.type === "done" ? (
        <div className="w-full text-xs text-muted-foreground sm:w-auto">{status.count}</div>
      ) : null}
    </div>
  );
}
