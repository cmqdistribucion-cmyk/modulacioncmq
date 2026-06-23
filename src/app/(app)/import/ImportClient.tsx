"use client";

import type { ClienteUpsert } from "./actions";
import { upsertClientes } from "./actions";
import { getSupabaseEnv } from "@/lib/supabase/env";
import * as XLSX from "xlsx";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

type FieldKey = keyof ClienteUpsert;

type Mapping = Partial<Record<FieldKey, string>>;

function normalizeKey(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-z0-9]/g, "");
}

function toStringCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    const s = String(value);
    if (s.endsWith(".0")) return s.slice(0, -2);
    return s;
  }
  return String(value).trim();
}

function detectField(header: string) {
  const key = normalizeKey(header);
  if (!key) return null;

  if (
    key === "n" ||
    key === "no" ||
    key === "num" ||
    key === "numerocliente" ||
    key === "nrocliente" ||
    key === "nro" ||
    key === "numero" ||
    key === "cliente" ||
    (key.includes("numero") && key.includes("cliente")) ||
    (key.includes("nro") && key.includes("cliente")) ||
    (key.includes("id") && key.includes("cliente")) ||
    (key.includes("cuenta") && key.includes("cliente")) ||
    key === "codigo" ||
    key === "codcliente"
  ) {
    return "numero_cliente";
  }

  if (key === "title" || key === "titulo") return "title";
  if (key === "nombre" || key === "razonsocial") return "nombre";
  if (key === "domicilio" || key === "direccion") return "domicilio";
  if (key === "vendedor") return "vendedor";
  if (key === "sv") return "sv";
  if (key === "telefono" || key === "tel" || key === "celular") return "telefono";
  if (key === "zona") return "zona";
  if (key === "msjenfra" || key === "mensajeenfactura" || key === "mensajefactura") return "msj_en_fra";

  return null;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildInitialMapping(headers: string[]) {
  const mapping: Mapping = {};
  for (const h of headers) {
    const field = detectField(h);
    if (!field) continue;
    if (mapping[field]) continue;
    mapping[field] = h;
  }
  return mapping;
}

function buildRows(rawRows: Record<string, unknown>[], mapping: Mapping) {
  const numeroHeader = mapping.numero_cliente;
  if (!numeroHeader) return [];

  const rows: ClienteUpsert[] = rawRows
    .map((row) => {
      const numero = toStringCell(row[numeroHeader]).trim();
      if (!numero) return null;

      const out: ClienteUpsert = { numero_cliente: numero };
      const optionalFields = [
        "title",
        "nombre",
        "domicilio",
        "vendedor",
        "sv",
        "telefono",
        "zona",
        "msj_en_fra",
      ] as const;

      for (const key of optionalFields) {
        const h = mapping[key];
        if (!h) continue;
        const v = toStringCell(row[h]).trim();
        out[key] = v ? v : null;
      }

      return out;
    })
    .filter((r): r is ClienteUpsert => Boolean(r));

  return rows;
}

export function ImportClient() {
  const env = useMemo(() => getSupabaseEnv(), []);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [status, setStatus] = useState<
    | { type: "idle" }
    | { type: "parsing" }
    | { type: "ready" }
    | { type: "uploading"; uploaded: number; total: number }
    | { type: "done" }
    | { type: "error"; message: string }
  >({ type: "idle" });

  const [isPending, startTransition] = useTransition();

  const parsedRows = useMemo(
    () => buildRows(rawRows, mapping),
    [mapping, rawRows],
  );

  const preview = useMemo(() => parsedRows.slice(0, 25), [parsedRows]);

  const stats = useMemo(() => {
    if (!rawRows.length) return null;
    const total = rawRows.length;
    const valid = parsedRows.length;
    const invalid = total - valid;
    return { total, valid, invalid };
  }, [parsedRows.length, rawRows.length]);

  async function parseFile(file: File) {
    setStatus({ type: "parsing" });
    setFileName(file.name);
    setHeaders([]);
    setRawRows([]);
    setMapping({});

    try {
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      const workbook = isCsv
        ? XLSX.read(await file.text(), { type: "string" })
        : XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("El archivo no tiene hojas.");
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) throw new Error("No pude leer la primera hoja.");

      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: true,
      });

      if (!json.length) throw new Error("El archivo está vacío.");

      const fileHeaders = Object.keys(json[0] ?? {});
      setHeaders(fileHeaders);
      setRawRows(json);
      setMapping(buildInitialMapping(fileHeaders));
      setStatus({ type: "ready" });

      return;
    } catch (e) {
      setStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error al leer el archivo",
      });
      return;
    }
  }

  function onUpload(rows: ClienteUpsert[]) {
    const chunks = chunk(rows, 250);
    setStatus({ type: "uploading", uploaded: 0, total: chunks.length });

    startTransition(async () => {
      try {
        for (let i = 0; i < chunks.length; i++) {
          await upsertClientes({ rows: chunks[i] });
          setStatus({
            type: "uploading",
            uploaded: i + 1,
            total: chunks.length,
          });
        }
        setStatus({ type: "done" });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Error al subir";
        const extra =
          message.toLowerCase().includes("row-level security") ||
          message.toLowerCase().includes("rls")
            ? " (Revisá policies RLS de la tabla clientes)"
            : message
                .toLowerCase()
                .includes("no unique or exclusion constraint")
              ? " (Falta UNIQUE sobre numero_cliente)"
              : "";
        setStatus({
          type: "error",
          message: extra ? `${message}${extra}` : message,
        });
      }
    });
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
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">Importar clientes</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Subí un Excel (.xlsx) o CSV. Se hace upsert por numero_cliente.
            </div>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm hover:bg-muted"
          >
            Volver al dashboard
          </Link>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-card-foreground shadow-sm hover:bg-muted">
            <input
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                if (!file) return;
                void parseFile(file);
              }}
            />
            Seleccionar archivo
          </label>

          {fileName ? (
            <div className="text-sm text-muted-foreground">{fileName}</div>
          ) : null}
        </div>

        <ImportControls
          headers={headers}
          mapping={mapping}
          onChangeMapping={setMapping}
          stats={stats}
          preview={preview}
          status={status}
          isPending={isPending}
          onUpload={onUpload}
          parsedRows={parsedRows}
        />
      </section>
    </div>
  );
}

function ImportControls(props: {
  headers: string[];
  mapping: Mapping;
  onChangeMapping: (next: Mapping) => void;
  parsedRows: ClienteUpsert[] | null;
  stats: { total: number; valid: number; invalid: number } | null;
  preview: ClienteUpsert[];
  status:
    | { type: "idle" }
    | { type: "parsing" }
    | { type: "ready" }
    | { type: "uploading"; uploaded: number; total: number }
    | { type: "done" }
    | { type: "error"; message: string };
  isPending: boolean;
  onUpload: (rows: ClienteUpsert[]) => void;
}) {
  const requiredMissing = props.headers.length > 0 && !props.mapping.numero_cliente;

  return (
    <div className="mt-5">
      {props.status.type === "parsing" ? (
        <div className="text-sm text-muted-foreground">Leyendo archivo...</div>
      ) : null}

      {props.status.type === "error" ? (
        <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {props.status.message}
        </div>
      ) : null}

      {props.stats ? (
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-3">
          <div>Total filas: {props.stats.total}</div>
          <div>Válidas: {props.stats.valid}</div>
          <div>Ignoradas (sin Nº): {props.stats.invalid}</div>
        </div>
      ) : null}

      {props.status.type === "ready" && props.headers.length ? (
        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <div className="text-sm font-semibold">Mapeo de columnas</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Seleccioná qué columna corresponde a cada campo. El Nº de cliente es
            obligatorio.
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MappingSelect
              label="Nº de cliente (obligatorio)"
              value={props.mapping.numero_cliente ?? ""}
              headers={props.headers}
              onChange={(v) =>
                props.onChangeMapping({ ...props.mapping, numero_cliente: v })
              }
            />
            <MappingSelect
              label="Nombre"
              value={props.mapping.nombre ?? ""}
              headers={props.headers}
              onChange={(v) =>
                props.onChangeMapping({ ...props.mapping, nombre: v || undefined })
              }
            />
            <MappingSelect
              label="Domicilio"
              value={props.mapping.domicilio ?? ""}
              headers={props.headers}
              onChange={(v) =>
                props.onChangeMapping({
                  ...props.mapping,
                  domicilio: v || undefined,
                })
              }
            />
            <MappingSelect
              label="Teléfono"
              value={props.mapping.telefono ?? ""}
              headers={props.headers}
              onChange={(v) =>
                props.onChangeMapping({
                  ...props.mapping,
                  telefono: v || undefined,
                })
              }
            />
            <MappingSelect
              label="Zona"
              value={props.mapping.zona ?? ""}
              headers={props.headers}
              onChange={(v) =>
                props.onChangeMapping({ ...props.mapping, zona: v || undefined })
              }
            />
            <MappingSelect
              label="Vendedor"
              value={props.mapping.vendedor ?? ""}
              headers={props.headers}
              onChange={(v) =>
                props.onChangeMapping({
                  ...props.mapping,
                  vendedor: v || undefined,
                })
              }
            />
            <MappingSelect
              label="SV"
              value={props.mapping.sv ?? ""}
              headers={props.headers}
              onChange={(v) =>
                props.onChangeMapping({ ...props.mapping, sv: v || undefined })
              }
            />
            <MappingSelect
              label="Title"
              value={props.mapping.title ?? ""}
              headers={props.headers}
              onChange={(v) =>
                props.onChangeMapping({ ...props.mapping, title: v || undefined })
              }
            />
            <MappingSelect
              label="MSJ EN FRA"
              value={props.mapping.msj_en_fra ?? ""}
              headers={props.headers}
              onChange={(v) =>
                props.onChangeMapping({ ...props.mapping, msj_en_fra: v || undefined })
              }
            />
          </div>

          {requiredMissing ? (
            <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              No detecté la columna del Nº de cliente. Elegila arriba para poder
              subir.
            </div>
          ) : null}
        </div>
      ) : null}

      {props.preview.length ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border bg-card px-3 py-2 text-sm font-medium">
            Vista previa (primeras {props.preview.length})
          </div>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-border">
                  <th className="px-3 py-2">Nº</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Domicilio</th>
                  <th className="px-3 py-2">Zona</th>
                  <th className="px-3 py-2">MSJ EN FRA</th>
                </tr>
              </thead>
              <tbody>
                {props.preview.map((r) => (
                  <tr key={r.numero_cliente} className="border-b border-border">
                    <td className="px-3 py-2">{r.numero_cliente}</td>
                    <td className="px-3 py-2">{r.nombre ?? "—"}</td>
                    <td className="px-3 py-2">{r.domicilio ?? "—"}</td>
                    <td className="px-3 py-2">{r.zona ?? "—"}</td>
                    <td className="px-3 py-2 text-red-600 font-bold">{r.msj_en_fra ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {props.status.type === "ready" && props.stats?.valid ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              if (props.parsedRows) props.onUpload(props.parsedRows);
            }}
            disabled={props.isPending || !props.parsedRows || requiredMissing}
            className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
          >
            SUBIR CLIENTES
          </button>
        </div>
      ) : null}

      {props.status.type === "uploading" ? (
        <div className="mt-4 text-sm text-muted-foreground">
          Subiendo... {props.status.uploaded}/{props.status.total} lotes
        </div>
      ) : null}

      {props.status.type === "done" ? (
        <div className="mt-4 flex flex-col gap-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div>Importación finalizada.</div>
          <Link href="/dashboard" className="underline">
            Ir a modular
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function MappingSelect(props: {
  label: string;
  value: string;
  headers: string[];
  onChange: (header: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="text-sm font-medium text-card-foreground">{props.label}</div>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">— Sin asignar —</option>
        {props.headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );
}
