import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./env";

export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next();
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // If we're on a protected route and the session is invalid, clear cookies and redirect to login
  const isPublic =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/_next") ||
    request.nextUrl.pathname.startsWith("/favicon.ico");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Clear auth cookies by creating a new response
    const redirectResponse = NextResponse.redirect(url);
    request.cookies.getAll().forEach(cookie => {
      if (cookie.name.startsWith("sb-")) {
        redirectResponse.cookies.delete(cookie.name);
      }
    });
    return redirectResponse;
  }

  return response;
}
