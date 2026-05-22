"use client";

import {
  adminCreateUser,
  adminGenerateRecoveryLink,
  adminListUsers,
  adminGetAppName,
  adminSetAppName,
  adminSetUserAvatar,
  adminSetPassword,
  adminSetRole,
  adminSetUserBanned,
} from "../admin/actions";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

type UserRow = Awaited<ReturnType<typeof adminListUsers>>[number];

export function UsuariosClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [appName, setAppName] = useState<string>("");

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "usuario">("usuario");

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const selected = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const [resetPassword, setResetPassword] = useState("");
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  const refresh = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const list = await adminListUsers();
        setUsers(list);
        if (selectedUserId && !list.some((u) => u.id === selectedUserId)) {
          setSelectedUserId("");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar usuarios");
      }
    });
  }, [selectedUserId]);

  useEffect(() => {
    const id = window.setTimeout(async () => {
      refresh();
      try {
        const name = await adminGetAppName();
        if (name) setAppName(name);
      } catch {
        // ignore
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  async function onCreateUser() {
    setError(null);
    setRecoveryLink(null);
    startTransition(async () => {
      try {
        await adminCreateUser({
          email: newEmail,
          password: newPassword,
          role: newRole,
        });
        setNewEmail("");
        setNewPassword("");
        setNewRole("usuario");
        notify("Usuario creado");
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al crear usuario");
      }
    });
  }

  async function onSetPassword() {
    if (!selected) return;
    setError(null);
    setRecoveryLink(null);
    startTransition(async () => {
      try {
        await adminSetPassword({ userId: selected.id, password: resetPassword });
        setResetPassword("");
        notify("Contraseña actualizada");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al resetear clave");
      }
    });
  }

  async function onGenerateLink() {
    if (!selected?.email) return;
    setError(null);
    startTransition(async () => {
      try {
        const { actionLink } = await adminGenerateRecoveryLink({
          email: selected.email ?? "",
        });
        setRecoveryLink(actionLink);
        await navigator.clipboard.writeText(actionLink);
        notify("Link copiado");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al generar link");
      }
    });
  }

  async function onSetRole(role: "admin" | "usuario") {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      try {
        await adminSetRole({ userId: selected.id, role });
        notify("Rol actualizado");
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al asignar rol");
      }
    });
  }

  async function onToggleBan() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      try {
        await adminSetUserBanned({ userId: selected.id, banned: !selected.is_banned });
        notify(selected.is_banned ? "Usuario habilitado" : "Usuario deshabilitado");
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cambiar estado");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">Usuarios y claves</div>
            <div className="text-sm text-muted-foreground">
              Crear usuarios, resetear clave y asignar roles.
            </div>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
          >
            {loading ? "Cargando..." : "Actualizar"}
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <div className="text-sm font-semibold">Configuración de la aplicación</div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="Nombre de la aplicación"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    await adminSetAppName({ name: appName });
                    setToast("Nombre actualizado");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Error al guardar");
                  }
                });
              }}
              disabled={loading || !appName.trim()}
              className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
            >
              Guardar nombre
            </button>
          </div>
        </div>

        {toast ? (
          <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            {toast}
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            {error}
          </div>
        ) : null}
      </div>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-base font-semibold">Crear usuario</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Se crea con email confirmado.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            type="email"
            placeholder="email@empresa.com"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type="password"
            placeholder="Contraseña"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as "admin" | "usuario")}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="usuario">Usuario</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={onCreateUser}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
          >
            Crear usuario
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-base font-semibold">Usuarios</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Seleccioná un usuario para administrar.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border bg-card px-3 py-2 text-sm font-medium">
              Lista
            </div>
            <div className="max-h-96 overflow-auto">
              {users.length ? (
                users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUserId(u.id);
                      setRecoveryLink(null);
                      setResetPassword("");
                    }}
                    className={`flex w-full items-start justify-between gap-3 px-3 py-3 text-left hover:bg-muted ${
                      selectedUserId === u.id ? "bg-muted" : "bg-card"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {u.email ?? "(sin email)"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {u.id}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      <div>{u.role}</div>
                      {u.is_banned ? (
                        <div className="mt-1 font-semibold text-destructive">
                          Deshabilitado
                        </div>
                      ) : null}
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  Sin usuarios.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            {selected ? (
              <div className="flex flex-col gap-4">
                <div>
                  <div className="text-sm font-semibold">Seleccionado</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {selected.email ?? "(sin email)"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {selected.id}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Rol: {selected.role}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onSetRole("usuario")}
                    disabled={loading}
                    className="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                  >
                    Hacer usuario
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetRole("admin")}
                    disabled={loading}
                    className="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                  >
                    Hacer admin
                  </button>
                </div>

                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-sm font-semibold">Resetear clave</div>
                  <div className="mt-2 flex flex-col gap-2">
                    <input
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      type="password"
                      placeholder="Nueva contraseña"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={onSetPassword}
                      disabled={loading || !resetPassword}
                      className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-95 disabled:opacity-60"
                    >
                      Actualizar contraseña
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-sm font-semibold">
                    Acceso al sistema
                  </div>
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={onToggleBan}
                      disabled={loading}
                      className={`inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                        selected.is_banned
                          ? "border-green-600 bg-green-50 text-green-700 hover:bg-green-100"
                          : "border-destructive bg-destructive/5 text-destructive hover:bg-destructive/10"
                      } disabled:opacity-60`}
                    >
                      {selected.is_banned ? "Habilitar usuario" : "Deshabilitar usuario"}
                    </button>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {selected.is_banned
                        ? "El usuario no puede iniciar sesión actualmente."
                        : "El usuario tiene acceso normal al sistema."}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-sm font-semibold">
                    Link de recuperación (email)
                  </div>
                  <div className="mt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={onGenerateLink}
                      disabled={loading || !selected.email}
                      className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
                    >
                      Generar y copiar link
                    </button>
                    {recoveryLink ? (
                      <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                        {recoveryLink}
                      </pre>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Seleccioná un usuario a la izquierda.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
