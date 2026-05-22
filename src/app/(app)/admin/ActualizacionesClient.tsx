"use client";

import Link from "next/link";
import { ExportModulaciones } from "@/components/export-modulaciones";
import * as XLSX from "xlsx";
import { useCallback, useEffect, useState } from "react";
import {
  adminClearClientes,
  adminClearPuntuaciones,
  adminUpsertPuntuaciones,
  type PuntuacionRow,
} from "../admin/actions";

export function ActualizacionesClient() {
  const [openGestion, setOpenGestion] = useState<boolean>(true);

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">Actualizaciones de datos</div>
            <div className="text-sm text-muted-foreground">
              Importación y exportación de datos del sistema.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpenGestion((v) => !v)}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
          >
            {openGestion ? "Ocultar" : "Mostrar"}
          </button>
        </div>

        {openGestion ? (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
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

            <ClearClientesCard />
            <ImportPuntuaciones />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ClearClientesCard() {
  const [clearing, setClearing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function clearAll() {
    const ok = window.confirm(
      "Esto va a borrar TODA la base de CLIENTES. Las MODULACIONES NO se borrarán. ¿Querés continuar?",
    );
    if (!ok) return;
    setClearing(true);
    setMsg(null);
    try {
      const res = await adminClearClientes();
      setMsg(
        typeof res.clientesDeleted === "number"
          ? `Base de clientes limpiada. Clientes borrados: ${res.clientesDeleted}`
          : "Base de clientes limpiada.",
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error al limpiar");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="text-sm font-semibold">Limpiar base</div>
      <div className="mt-1 text-sm text-muted-foreground">
        Borra todos los clientes (las modulaciones se conservan).
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => void clearAll()}
          disabled={clearing}
          className="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm text-red-600 hover:bg-muted disabled:opacity-60"
        >
          {clearing ? "Limpiando..." : "Limpiar base de clientes"}
        </button>
      </div>
      {msg ? (
        <div className="mt-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {msg}
        </div>
      ) : null}
    </div>
  );
}

function ImportPuntuaciones() {
  const [status, setStatus] = useState<
    | { type: "idle" }
    | { type: "parsing" }
    | { type: "ready"; count: number }
    | { type: "uploading" }
    | { type: "done"; count: number }
    | { type: "error"; message: string }
  >({ type: "idle" });
  const [rows, setRows] = useState<PuntuacionRow[]>([]);
  const [preview, setPreview] = useState<PuntuacionRow[]>([]);
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState<string | null>(null);

  async function downloadTemplate() {
    const example: Array<Record<string, unknown>> = [
      {
        "Nº de cliente": "91824",
        "Nombre del cliente": "Cliente ejemplo",
        Puntuacion: 5,
        Comentario: "Excelente",
        "Fecha de Puntuacion": new Date().toISOString().slice(0, 10),
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(example);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Puntuaciones");

    const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([arrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_puntuaciones.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function excelSerialToIsoDate(serial: number) {
    // Excel serials are basically UTC midnight offsets if treated as "dates only"
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const dt = new Date(ms);
    if (Number.isNaN(dt.getTime())) return "";
    // Aseguramos que devolvemos la fecha en formato YYYY-MM-DD basándonos en UTC
    return dt.toISOString().split("T")[0] || "";
  }

  function parseFechaToIsoDate(value: unknown) {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return "";
      // Si XLSX nos da un Date, suele ser medianoche local.
      // Para evitar el desplazamiento, lo convertimos a YYYY-MM-DD
      // usando los métodos locales si es un objeto Date nativo.
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, "0");
      const d = String(value.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return excelSerialToIsoDate(value);
    }
    const raw = String(value ?? "").trim();
    if (!raw) return "";

    const numeric = Number(raw);
    if (Number.isFinite(numeric) && raw.match(/^\d+(\.\d+)?$/)) {
      return excelSerialToIsoDate(numeric);
    }

    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const dmY = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dmY) {
      const d = dmY[1].padStart(2, "0");
      const m = dmY[2].padStart(2, "0");
      const yRaw = Number(dmY[3]);
      const y = String(yRaw < 100 ? 2000 + yRaw : yRaw);
      return `${y}-${m}-${d}`;
    }

    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return "";
    // Fallback final: usar UTC para evitar desfases si es posible
    return dt.toISOString().split("T")[0] || "";
  }

  function parsePuntuacion(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const raw = String(value ?? "").trim();
    if (!raw) return NaN;
    const normalized = raw.replace(",", ".").replaceAll(/[^0-9.\-]/g, "");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : NaN;
  }

  async function parseFile(file: File) {
    setStatus({ type: "parsing" });
    setRows([]);
    setPreview([]);
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
      const map: Record<string, keyof PuntuacionRow | null> = {};
      for (const h of headers) {
        const k = norm(h);
        if (
          (k.includes("cliente") &&
            (k.includes("numero") ||
              k.includes("nro") ||
              k.includes("num") ||
              k === "ndecliente" ||
              k === "nodecliente" ||
              k === "nrodecliente" ||
              k === "numerodecliente")) ||
          k === "numerocliente" ||
          k === "nrocliente" ||
          k === "ncliente" ||
          k === "numcliente" ||
          k === "nro" ||
          k === "numero" ||
          k === "cliente"
        ) {
          map[h] = "cliente_numero";
        } else if (
          k === "nombre" ||
          k.includes("razonsocial") ||
          (k.includes("nombre") && k.includes("cliente"))
        ) {
          map[h] = "cliente_nombre";
        } else if (k.includes("fecha")) {
          map[h] = "fecha";
        } else if (
          (k.includes("puntuacion") || k.includes("puntaje")) &&
          !k.includes("fecha")
        ) {
          map[h] = "puntuacion";
        } else if (k === "comentario" || k.includes("observacion")) {
          map[h] = "comentario";
        } else {
          map[h] = null;
        }
      }

      const out = json
        .map((r) => {
          const row: Partial<PuntuacionRow> = {};
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
                row.puntuacion = parsePuntuacion(val);
                break;
              case "comentario":
                row.comentario = String(val ?? "") || null;
                break;
              case "fecha":
                row.fecha = parseFechaToIsoDate(val);
                break;
            }
          }
          const numero = String(row.cliente_numero ?? "").trim();
          const puntuacion = Number(row.puntuacion);
          const fecha = String(row.fecha ?? "");
          if (!numero || !Number.isFinite(puntuacion) || !fecha) return null;
          return {
            cliente_numero: numero,
            cliente_nombre: row.cliente_nombre ?? null,
            puntuacion,
            comentario: row.comentario ?? null,
            fecha,
          } as PuntuacionRow;
        })
        .filter(Boolean) as PuntuacionRow[];

      if (!out.length) {
        const first = json[0] ?? {};
        const hNum = headers.find((h) => map[h] === "cliente_numero") ?? "";
        const hPunt = headers.find((h) => map[h] === "puntuacion") ?? "";
        const hFecha = headers.find((h) => map[h] === "fecha") ?? "";
        const exampleNum = hNum ? (first[hNum] ?? "") : "(no mapeado)";
        const examplePuntuacion = hPunt ? (first[hPunt] ?? "") : "(no mapeado)";
        const exampleFecha = hFecha ? (first[hFecha] ?? "") : "(no mapeado)";
        const hint = `Mapeo: Nº="${hNum || "-"}", Puntuacion="${hPunt || "-"}", Fecha="${hFecha || "-"}". Ejemplo Nº="${String(exampleNum)}", Puntuacion="${String(examplePuntuacion)}", Fecha="${String(exampleFecha)}"`;
        throw new Error(
          `No pude leer filas válidas. Revisá columnas y formato. Encabezados detectados: ${headers.join(
            ", ",
          )}. ${hint}`,
        );
      }

      setRows(out);
      setPreview(out.slice(0, 5));
      setStatus({ type: "ready", count: out.length });
    } catch (e) {
      setStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error al leer archivo",
      });
    }
  }

  async function upload() {
    if (!rows.length) return;
    setStatus({ type: "uploading" });
    try {
      await adminUpsertPuntuaciones({ rows });
      setStatus({ type: "done", count: rows.length });
    } catch (e) {
      setStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error al subir",
      });
    }
  }

  async function clearAll() {
    const ok = window.confirm(
      "Esto va a borrar TODAS las puntuaciones cargadas. ¿Querés continuar?",
    );
    if (!ok) return;
    setClearing(true);
    setClearMsg(null);
    try {
      const res = await adminClearPuntuaciones();
      setRows([]);
      setPreview([]);
      setStatus({ type: "idle" });
      setClearMsg(
        typeof res.deleted === "number"
          ? `Base de puntuaciones limpiada (${res.deleted} filas).`
          : "Base de puntuaciones limpiada.",
      );
    } catch (e) {
      setClearMsg(e instanceof Error ? e.message : "Error al limpiar");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4 md:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Importar puntuaciones (últimas 3)</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Excel/CSV con: Nº de cliente, Nombre del cliente, Puntuacion, Comentario, Fecha de
            Puntuacion.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadTemplate()}
            className="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
          >
            Descargar plantilla
          </button>
          <button
            type="button"
            onClick={() => void clearAll()}
            disabled={clearing}
            className="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm text-red-600 hover:bg-muted disabled:opacity-60"
          >
            {clearing ? "Limpiando..." : "Limpiar base"}
          </button>
        </div>
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
          onClick={() => void upload()}
          disabled={status.type !== "ready"}
          className="inline-flex items-center justify-center rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
        >
          Subir
        </button>
      </div>

      {preview.length ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border bg-card px-3 py-2 text-sm font-medium">
            Vista previa (primeras {preview.length})
          </div>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-border">
                  <th className="px-3 py-2">Nº</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Puntuación</th>
                  <th className="px-3 py-2">Comentario</th>
                  <th className="px-3 py-2">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, idx) => (
                  <tr key={`${r.cliente_numero}-${idx}`} className="border-b border-border">
                    <td className="px-3 py-2">{r.cliente_numero}</td>
                    <td className="px-3 py-2">{r.cliente_nombre ?? "—"}</td>
                    <td className="px-3 py-2">{r.puntuacion}</td>
                    <td className="px-3 py-2">{r.comentario ?? "—"}</td>
                    <td className="px-3 py-2">{r.fecha}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {status.type === "parsing" ? (
        <div className="mt-2 text-sm text-muted-foreground">Leyendo archivo...</div>
      ) : status.type === "ready" ? (
        <div className="mt-2 text-sm text-muted-foreground">{status.count} filas listas</div>
      ) : status.type === "uploading" ? (
        <div className="mt-2 text-sm text-muted-foreground">Subiendo...</div>
      ) : status.type === "done" ? (
        <div className="mt-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Importación finalizada ({status.count}).
        </div>
      ) : status.type === "error" ? (
        <div className="mt-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {status.message}
        </div>
      ) : null}

      {clearMsg ? (
        <div className="mt-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {clearMsg}
        </div>
      ) : null}
    </div>
  );
}
