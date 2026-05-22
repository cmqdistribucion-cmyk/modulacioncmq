import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function isAdmin() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;

  const { data, error } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error) return false;
  return Boolean(data?.user_id);
}

export async function requireAdmin() {
  const ok = await isAdmin();
  if (!ok) throw new Error("No autorizado");
}

