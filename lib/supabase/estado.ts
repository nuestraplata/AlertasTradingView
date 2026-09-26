import { supabaseEnv } from "./env";

export type EstadoSupabase =
  | { ok: true; registroPublicoDesactivado: boolean; emailActivo: boolean }
  | { ok: false; error: string };

/**
 * Chequeo liviano de conexión: pide la configuración pública de Auth con la
 * publishable key. Si responde 200, la URL y la clave son correctas.
 */
export async function verificarSupabase(): Promise<EstadoSupabase> {
  try {
    const { url, publishableKey } = supabaseEnv();
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { ok: false, error: `Supabase respondió HTTP ${res.status}` };
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
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
