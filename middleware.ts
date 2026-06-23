import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./src/lib/supabase/middleware";
import { isSupabaseConfigured } from "./src/lib/supabase/env";

export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next();
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
