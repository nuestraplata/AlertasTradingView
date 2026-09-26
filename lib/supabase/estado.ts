import { describirError } from "@/lib/errores";
import { supabaseEnv } from "./env";

export type EstadoSupabase =
  | { ok: true; registroPublicoDesactivado: boolean; emailActivo: boolean }
  | { ok: false; error: string };

/**
 * Chequeo liviano de conexión: pide la configuración pública de Auth con la
 * publishable key. Si responde 200, la URL y la clave son correctas.
 */
export async function verificarSupabase(): Promise<EstadoSupabase> {
  let host = "(sin URL)";
  try {
    const { url, publishableKey } = supabaseEnv();
    host = new URL(url).host;
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Host: ${host}\nSupabase respondió HTTP ${res.status}`,
      };
    }
    const settings = (await res.json()) as {
      disable_signup?: boolean;
      external?: { email?: boolean };
    };
    return {
      ok: true,
      registroPublicoDesactivado: settings.disable_signup === true,
      emailActivo: settings.external?.email === true,
    };
  } catch (e) {
    console.error("[verificarSupabase] host:", host, e);
    const aviso = /[^a-z0-9.-]|xn--/i.test(host)
      ? "\n⚠️ El host tiene caracteres no ASCII: revisá la URL en .env.local"
      : "";
    return { ok: false, error: `Host: ${host}${aviso}\n${describirError(e)}` };
  }
}
