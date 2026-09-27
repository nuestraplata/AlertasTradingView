import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResultadoProceso } from "./procesar";

export type RespuestaWebhook = { http: number; cuerpo: Record<string, unknown> };

/**
 * Guarda el resultado de procesarAlerta y arma la respuesta HTTP.
 * Recibe el cliente con la clave secreta (lo único que puede insertar).
 * Las respuestas no dan detalles a quien manda un pedido rechazado.
 */
export async function registrarResultado(
  supabase: Pick<SupabaseClient, "from">,
  resultado: ResultadoProceso,
  ip: string | null,
): Promise<RespuestaWebhook> {
  if (resultado.tipo === "rechazo") {
    const { error } = await supabase
      .from("intentos_rechazados")
      .insert({ ip, motivo: resultado.motivo });
    if (error) console.error("[webhook] no se pudo registrar el intento", error.code, error.message);
    return { http: resultado.http, cuerpo: { ok: false } };
  }

  const { data, error } = await supabase
    .from("alertas")
    .insert(resultado.alerta)
    .select("id")
    .single();
  if (error) {
    console.error("[webhook] no se pudo guardar la alerta", error.code, error.message);
    return { http: 500, cuerpo: { ok: false } };
  }
  return {
    http: 200,
    cuerpo: { ok: true, id: data.id, estado: resultado.alerta.estado },
  };
}
