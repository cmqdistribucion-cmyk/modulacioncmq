import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <DashboardClient />;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return <DashboardClient />;

  return <DashboardClient />;
}
