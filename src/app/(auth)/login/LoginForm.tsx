"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const env = useMemo(() => getSupabaseEnv(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<
    { type: "idle" } | { type: "loading" } | { type: "error"; message: string }
  >({ type: "idle" });

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ type: "loading" });

    if (env.missing.length) {
      setStatus({
        type: "error",
        message: `Faltan variables de entorno: ${env.missing.join(", ")}`,
      });
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus({ type: "error", message: error.message });
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <div className="mb-1 text-sm font-medium text-card-foreground">
          Email
        </div>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="usuario@empresa.com"
          required
        />
      </div>

      <div>
        <div className="mb-1 text-sm font-medium text-card-foreground">
          Contraseña
        </div>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="••••••••"
          required
        />
      </div>

      {status.type === "error" ? (
        <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {status.message}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={status.type === "loading"}
        className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
      >
        {status.type === "loading" ? "Ingresando..." : "Ingresar"}
      </button>
    </form>
  );
}
