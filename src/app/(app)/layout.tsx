import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthInactivityHandler } from "@/components/auth-inactivity-handler";
import Link from "next/link";
import { isAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await isAdmin();
  let appName: string | null = null;
  let userEmail: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { data: userData } = await supabase.auth.getUser();
      userEmail = userData?.user?.email ?? null;
    }
    const adminClient = createSupabaseAdminClient();
    const { data } = await adminClient
      .from("settings")
      .select("value")
      .eq("key", "app_name")
      .limit(1)
      .maybeSingle();
    appName = (data?.value as string) ?? null;
  } catch {
    // ignore
  }
  return (
    <div 
      className="flex min-h-full flex-1 flex-col"
      style={{
        background: 'linear-gradient(135deg, #e63946 0%, #1d3557 100%)',
      }}
    >
      <AuthInactivityHandler />
      <header className="border-b border-red-700 bg-red-600/90 text-white backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-6 py-4">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">
              {appName || "techPro Modulaciones"}
            </div>
            <div className="truncate text-sm text-white/80">
              Gestión logística
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white shadow-sm hover:bg-white/15"
            >
              Modular
            </Link>
            <Link
              href="/actualizacion"
              className="inline-flex items-center justify-center rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white shadow-sm hover:bg-white/15"
            >
              Actualización
            </Link>
            {admin ? (
              <>
                <Link
                  href="/analisis"
                  className="inline-flex items-center justify-center rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white shadow-sm hover:bg-white/15"
                >
                  Análisis
                </Link>
                <Link
                  href="/admin"
                  className="inline-flex items-center justify-center rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white shadow-sm hover:bg-white/15"
                >
                  Base de datos
                </Link>
                <Link
                  href="/configuracion"
                  className="inline-flex items-center justify-center rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white shadow-sm hover:bg-white/15"
                >
                  Configuración
                </Link>
                <Link
                  href="/usuarios"
                  className="inline-flex items-center justify-center rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white shadow-sm hover:bg-white/15"
                >
                  Usuarios
                </Link>
              </>
            ) : null}
            <ThemeToggle />
            {userEmail ? (
              <span className="max-w-[150px] truncate text-[11px] font-medium text-white/70">
                {userEmail}
              </span>
            ) : null}
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        {children}
      </main>
    </div>
  );
}
