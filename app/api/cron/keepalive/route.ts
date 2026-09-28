import { secretoCorrecto } from "@/lib/secretos";
import { createAdminClient } from "@/lib/supabase/admin";
import { validarSecreto } from "@/lib/supabase/env";

/**
 * Cron diario de Vercel (vercel.json): una consulta mínima a Supabase para
 * que el plan Free no pause el proyecto por inactividad (docs/ESPECIFICACION.md
 * §10, F2). Vercel manda "Authorization: Bearer <CRON_SECRET>".
 * Es solo lectura: si Vercel lo ejecuta dos veces, no pasa nada.
 */
export async function GET(request: Request) {
  let secreto: string;
  try {
    secreto = validarSecreto("CRON_SECRET", process.env.CRON_SECRET);
  } catch (e) {
    console.error("[cron] configuración:", e instanceof Error ? e.message : e);
    return Response.json({ ok: false }, { status: 500 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!secretoCorrecto(token, secreto)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const inicio = Date.now();
  try {
    // "alertas": la única tabla que service_role puede leer (migración 3).
    // tickers / activos son solo del usuario logueado.
    const { error } = await createAdminClient().from("alertas").select("id").limit(1);
    if (error) throw new Error(`${error.code} ${error.message}`);
  } catch (e) {
    // Queda en los logs de Vercel (Cron Jobs → View Logs).
    console.error("[cron] keepalive falló:", e instanceof Error ? e.message : e);
    return Response.json({ ok: false }, { status: 502 });
  }

  const ms = Date.now() - inicio;
  console.log(`[cron] keepalive OK (${ms} ms)`);
  return Response.json({ ok: true, ms });
}
