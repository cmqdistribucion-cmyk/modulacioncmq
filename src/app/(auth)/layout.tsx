import { ThemeToggle } from "@/components/theme-toggle";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  let appName: string | null = null;
  try {
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
    <div className="flex min-h-full flex-1 items-center justify-center px-6 py-10" style={{ background: 'linear-gradient(135deg, #e63946 0%, #1d3557 100%)' }}>
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between text-white">
          <div className="text-lg font-semibold">{appName || "techPro Modulaciones"}</div>
          <ThemeToggle />
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}

