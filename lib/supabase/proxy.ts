import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

/**
 * Refresca la sesión de Supabase en cada request y devuelve la respuesta
 * (con las cookies actualizadas) y los claims del usuario, o null si no
 * hay sesión. Lo usa proxy.ts.
 */
export async function actualizarSesion(request: NextRequest) {
  const { url, publishableKey } = supabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // Evita que un CDN cachee una respuesta con cookies de sesión.
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // No meter código entre createServerClient y getClaims: getClaims es lo
  // que dispara el refresco del token.
  const { data } = await supabase.auth.getClaims();

  return { response, claims: data?.claims ?? null };
}
