"use client";

import * as XLSX from "xlsx";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { upsertChoferes, upsertMotivos, addChofer, addMotivo } from "./actions";
import { getSupabaseEnv } from "@/lib/supabase/env";

type ParseResult = {
  fileName: string;
  nombres: string[];
};

function normalizeKey(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-z0-9]/g, "");
}

function uniq(items: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const k = item.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function parseNamesFromSheet(sheet: XLSX.WorkSheet) {
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });
  if (!json.length) return { headers: [] as string[], nombres: [] as string[] };

  const headers = Object.keys(json[0] ?? {});
  const normalizedHeaders = headers.map((h) => normalizeKey(h));

  let selectedHeader: string | null = null;
  for (let i = 0; i < headers.length; i++) {
    const k = normalizedHeaders[i];
    if (k === "nombre" || k === "descripcion" || k === "motivo" || k === "chofer") {
      selectedHeader = headers[i];
      break;
    }
  }
  if (!selectedHeader) selectedHeader = headers[0] ?? null;

  const nombres = uniq(
    json
      .map((row) => String(row[selectedHeader as string] ?? "").trim())
      .filter(Boolean),
  );

  return { headers, nombres };
}

async function readWorkbook(file: File) {
  const isCsv = file.name.toLowerCase().endsWith(".csv");
  const workbook = isCsv
    ? XLSX.read(await file.text(), { type: "string" })
    : XLSX.read(await file.arrayBuffer(), { type: "array" });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("El archivo no tiene hojas.");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("No pude leer la primera hoja.");
  return sheet;
}

function uploadChunks(
  nombres: string[],
  chunkSize: number,
  upload: (chunk: string[]) => Promise<void>,
  onProgress: (uploaded: number, total: number) => void,
) {
  const chunks: string[][] = [];
  for (let i = 0; i < nombres.length; i += chunkSize) {
    chunks.push(nombres.slice(i, i + chunkSize));
  }

  return (async () => {
    for (let i = 0; i < chunks.length; i++) {
      await upload(chunks[i]);
      onProgress(i + 1, chunks.length);
    }
  })();
}

export function ListasClient() {
  const env = useMemo(() => getSupabaseEnv(), []);

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
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Choferes y Motivos</div>
          <div className="text-sm text-muted-foreground">
            Cargá listas desde Excel/CSV para usarlas en Modulación.
          </div>
        </div>
        <Link href="/dashboard" className="text-sm underline">
          Volver a modular
        </Link>
      </div>

      <ImportListCard
        title="Motivos"
        description="Importá una columna con los motivos (por ejemplo: Entrega, Reprogramación...)."
        onUpsert={async (nombres) => upsertMotivos({ nombres })}
        onAdd={async (nombre) => addMotivo({ nombre })}
        placeholder="Ej: MAL FACTURADO"
      />

      <ImportListCard
        title="Choferes"
        description="Importá una columna con los nombres de choferes."
        onUpsert={async (nombres) => upsertChoferes({ nombres })}
        onAdd={async (nombre) => addChofer({ nombre })}
        placeholder="Ej: Juan Perez"
      />
    </div>
  );
}

function ImportListCard(props: {
  title: string;
  description: string;
  onUpsert: (nombres: string[]) => Promise<void>;
  onAdd: (nombre: string) => Promise<void>;
  placeholder: string;
}) {
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [manualName, setManualName] = useState("");
  const [status, setStatus] = useState<
    | { type: "idle" }
    | { type: "parsing" }
    | { type: "ready" }
    | { type: "uploading"; uploaded: number; total: number }
    | { type: "done" }
    | { type: "error"; message: string }
  >({ type: "idle" });

  const [isPending, startTransition] = useTransition();

  async function onFile(file: File) {
    setStatus({ type: "parsing" });
    try {
      const sheet = await readWorkbook(file);
      const { nombres } = parseNamesFromSheet(sheet);
      if (!nombres.length) throw new Error("No encontré valores para importar.");
      const result: ParseResult = { fileName: file.name, nombres };
      setParsed(result);
      setPreview(nombres.slice(0, 25));
      setStatus({ type: "ready" });
    } catch (e) {
      setStatus({
        type: "error",
        message: e instanceof Error ? e.message : "Error al leer el archivo",
      });
      setParsed(null);
      setPreview([]);
    }
  }

  function onUpload() {
    if (!parsed?.nombres.length) return;

    setStatus({ type: "uploading", uploaded: 0, total: 1 });
    startTransition(async () => {
      try {
        await uploadChunks(parsed.nombres, 250, props.onUpsert, (u, t) =>
          setStatus({ type: "uploading", uploaded: u, total: t }),
        );
        setStatus({ type: "done" });
      } catch (e) {
        setStatus({
          type: "error",
          message: e instanceof Error ? e.message : "Error al subir",
        });
      }
    });
  }

  function handleManualAdd() {
    const name = manualName.trim();
    if (!name) return;

    startTransition(async () => {
      try {
        await props.onAdd(name);
        setManualName("");
        setStatus({ type: "done" });
        // Limpiamos el estado de éxito después de 3 segundos
        setTimeout(() => setStatus({ type: "idle" }), 3000);
      } catch (e) {
        setStatus({
          type: "error",
          message: e instanceof Error ? e.message : "Error al agregar",
        });
      }
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="flex-1">
          <div className="text-base font-semibold">{props.title}</div>
          <div className="mt-1 text-sm text-muted-foreground">{props.description}</div>
        </div>

        <div className="flex w-full flex-col gap-2 md:w-72">
          <div className="flex gap-2">
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder={props.placeholder}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleManualAdd();
              }}
            />
            <button
              type="button"
              onClick={handleManualAdd}
              disabled={isPending || !manualName.trim()}
              className="inline-flex items-center justify-center rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
            >
              Agregar
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-card-foreground shadow-sm hover:bg-muted cursor-pointer">
          <input
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              if (!file) return;
              void onFile(file);
            }}
          />
          Importar archivo
        </label>

        {parsed?.fileName ? (
          <div className="text-sm text-muted-foreground">{parsed.fileName}</div>
        ) : null}
      </div>

      {status.type === "parsing" ? (
        <div className="mt-3 text-sm text-muted-foreground">Leyendo archivo...</div>
      ) : null}

      {status.type === "error" ? (
        <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {status.message}
        </div>
      ) : null}

      {parsed ? (
        <div className="mt-3 text-sm text-muted-foreground">
          {parsed.nombres.length} ítems listos para subir.
        </div>
      ) : null}

      {preview.length ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border bg-card px-3 py-2 text-sm font-medium">
            Vista previa (primeros {preview.length})
          </div>
          <div className="max-h-64 overflow-auto">
            <ul className="divide-y divide-border">
              {preview.map((n) => (
                <li key={n} className="px-3 py-2 text-sm text-muted-foreground">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {status.type === "ready" && parsed?.nombres.length ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={onUpload}
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
          >
            SUBIR LISTA
          </button>
        </div>
      ) : null}

      {status.type === "uploading" ? (
        <div className="mt-4 text-sm text-muted-foreground">
          Subiendo... {status.uploaded}/{status.total} lotes
        </div>
      ) : null}

      {status.type === "done" ? (
        <div className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Importación finalizada.
        </div>
      ) : null}
    </section>
  );
}

