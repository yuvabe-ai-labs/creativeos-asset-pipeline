import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { mapAppMetadataToMustChangePassword } from "@/lib/dal-logic";
import { getUserWithRetry } from "@/lib/supabase/get-user-with-retry";
import {
  REMEMBER_COOKIE,
  applySessionPersistence,
  shouldPersistSession,
} from "@/lib/auth/session-persistence";

// Next.js 16 proxy (renamed from middleware). OPTIMISTIC session check only — no DB
// queries, no org resolution (that is the DAL's job, per D51). Also refreshes the
// Supabase auth cookie so sessions stay alive.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          // Honour "Remember me" on every refresh, not just at sign-in. Supabase hands
          // back its own long maxAge each time; writing that verbatim would turn an
          // unticked session cookie back into a persistent one on the next navigation.
          const persistSession = shouldPersistSession(
            request.cookies.get(REMEMBER_COOKIE)?.value,
          );
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(
              name,
              value,
              applySessionPersistence(options, persistSession),
            );
          }
        },
      },
    },
  );

  const user = await getUserWithRetry(supabase);

  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api");

  if (!user) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (mapAppMetadataToMustChangePassword(user.app_metadata) && !path.startsWith("/account/password")) {
    if (isApi) {
      return NextResponse.json({ error: "Password change required" }, { status: 403 });
    }
    const changePasswordUrl = new URL("/account/password", request.url);
    return NextResponse.redirect(changePasswordUrl);
  }

  return response;
}

// Run on everything EXCEPT: /login, webhooks (server-to-server, no session), Next
// internals, and static assets.
//
// mp4/webm are in the exclusion list for the Help chapter clips in public/help-videos.
// Without them every clip request runs the session check — an auth round-trip per file
// to serve a static asset — and the browser's range requests for video multiply that.
export const config = {
  matcher: [
    "/((?!login|api/webhooks|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|mp4|webm)$).*)",
  ],
};
