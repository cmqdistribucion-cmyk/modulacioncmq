"use client";

import { useEffect, useState, useTransition } from "react";
import { runDiagnostics } from "./actions";

type Result = Awaited<ReturnType<typeof runDiagnostics>>;

export function DiagnosticoClient() {
  const [result, setResult] = useState<Result | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function execute() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await runDiagnostics();
        setResult(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error inesperado");
      }
    });
  }

  useEffect(() => {
    const id = window.setTimeout(() => execute(), 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">Diagnóstico</div>
          <div className="text-sm text-muted-foreground">
            Verifica conexión, permisos y escritura en clientes/modulaciones.
          </div>
        </div>
        <button
          type="button"
          onClick={execute}
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
        >
          {isPending ? "Probando..." : "Reintentar"}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-border bg-background p-4 text-sm">
            Estado general:{" "}
            <span className="font-semibold">
              {result.ok ? "OK" : "Con problemas"}
            </span>
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border bg-card px-3 py-2 text-sm font-medium">
              Pasos
            </div>
            <div className="divide-y divide-border">
              {Object.entries(result.steps).map(([key, step]) => (
                <div key={key} className="flex flex-col gap-1 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">{key}</div>
                    <div
                      className={`text-xs ${step.ok ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {step.ok ? "OK" : "ERROR"}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {step.message}
                  </div>
                  {"data" in step && step.data ? (
                    <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                      {JSON.stringify(step.data, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {!result.ok ? (
            <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              Si ves errores de RLS/permission denied, tenés que crear policies
              para `clientes` y `modulaciones` (select/insert/update).
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 text-sm text-muted-foreground">Cargando...</div>
      )}
    </div>
  );
}
