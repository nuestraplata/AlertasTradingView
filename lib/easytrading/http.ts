import { secretoCorrecto } from "@/lib/secretos";
import { createAdminClient } from "@/lib/supabase/admin";
import { validarSecreto } from "@/lib/supabase/env";

// Piezas comunes de la API para EasyTrading (docs/API_EASYTRADING.md).
// EasyTrading se autentica con "Authorization: Bearer <EASYTRADING_TOKEN>".

export const MAX_BYTES_EASYTRADING = 10_000;

/** Respuesta JSON que ningún proxy ni CDN debe guardar. */
export function responder(cuerpo: Record<string, unknown>, status = 200): Response {
  return Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * null si el pedido trae el token correcto; si no, la respuesta de error
 * (401 sin detalles, o 500 si el servidor no tiene el token configurado:
 * nunca se acepta un token vacío).
 */
export function rechazoDeAutorizacion(request: Request): Response | null {
  let token: string;
  try {
    token = validarSecreto("EASYTRADING_TOKEN", process.env.EASYTRADING_TOKEN);
  } catch (e) {
    console.error("[easytrading] configuración:", e instanceof Error ? e.message : e);
    return responder({ ok: false }, 500);
  }
  const auth = request.headers.get("authorization") ?? "";
  const recibido = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  return secretoCorrecto(recibido, token) ? null : responder({ ok: false }, 401);
}

export type CuerpoLeido = { ok: true; datos: unknown } | { ok: false; respuesta: Response };

/** Lee el cuerpo como JSON (hasta 10 KB). */
export async function leerJson(request: Request): Promise<CuerpoLeido> {
  const largo = Number(request.headers.get("content-length") ?? "0");
  if (largo > MAX_BYTES_EASYTRADING) {
    return { ok: false, respuesta: responder({ ok: false, error: "cuerpo_demasiado_grande" }, 413) };
  }
  const texto = await request.text();
  if (Buffer.byteLength(texto, "utf8") > MAX_BYTES_EASYTRADING) {
    return { ok: false, respuesta: responder({ ok: false, error: "cuerpo_demasiado_grande" }, 413) };
  }
  try {
    return { ok: true, datos: JSON.parse(texto) };
  } catch {
    return { ok: false, respuesta: responder({ ok: false, error: "json_invalido" }, 400) };
  }
}

/** Id de señal de la URL: entero positivo. */
export function leerId(texto: string): number | null {
  if (!/^[1-9]\d{0,14}$/.test(texto)) return null;
  return Number(texto);
}

/** Error de la base: queda en el log; a EasyTrading, 500 para que reintente. */
export function errorDeBase(donde: string, error: { code?: string; message?: string } | null): Response {
  console.error(`[easytrading] ${donde}:`, error?.code, error?.message);
  return responder({ ok: false, error: "error_interno" }, 500);
}

/**
 * Cliente con la clave secreta, o la respuesta 500 si falta configurarla
 * (queda en el log; no es culpa de EasyTrading).
 */
export function clienteAdmin():
  | { ok: true; supabase: ReturnType<typeof createAdminClient> }
  | { ok: false; respuesta: Response } {
  try {
    return { ok: true, supabase: createAdminClient() };
  } catch (e) {
    console.error("[easytrading] configuración:", e instanceof Error ? e.message : e);
    return { ok: false, respuesta: responder({ ok: false }, 500) };
  }
}
