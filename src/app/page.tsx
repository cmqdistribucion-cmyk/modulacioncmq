import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data } = await supabase.auth.getUser();

  if (data.user) redirect("/dashboard");
  redirect("/login");
}
