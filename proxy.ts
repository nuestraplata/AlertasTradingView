import { NextResponse, type NextRequest } from "next/server";
import { RUTA_INICIO, RUTA_LOGIN, esRutaPublica } from "@/lib/auth/rutas";
import { actualizarSesion } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { response, claims } = await actualizarSesion(request);
  const { pathname, search } = request.nextUrl;

  if (esRutaPublica(pathname)) {
    // Ya logueado y entra a /login → al panel.
    if (claims && pathname === RUTA_LOGIN) {
      return redirigir(response, new URL(RUTA_INICIO, request.url));
    }
    return response;
  }

  if (!claims) {
    const login = new URL(RUTA_LOGIN, request.url);
    if (pathname !== RUTA_INICIO) login.searchParams.set("next", pathname + search);
    return redirigir(response, login);
  }

  return response;
}

/** Redirige conservando las cookies y cabeceras que dejó el refresco de sesión. */
function redirigir(desde: NextResponse, url: URL) {
  const redireccion = NextResponse.redirect(url);
  desde.cookies.getAll().forEach((c) => redireccion.cookies.set(c));
  desde.headers.forEach((valor, clave) => {
    if (/^(cache-control|expires|pragma)$/i.test(clave)) {
      redireccion.headers.set(clave, valor);
    }
  });
  return redireccion;
}

export const config = {
  matcher: [
    // Todo menos archivos estáticos e imágenes.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
