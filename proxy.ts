import type { NextRequest } from "next/server";
import { actualizarSesion } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Paso 2: solo refresca la sesión. La redirección a /login llega en el paso 3.
  const { response } = await actualizarSesion(request);
  return response;
}

export const config = {
  matcher: [
    // Todo menos archivos estáticos e imágenes.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
