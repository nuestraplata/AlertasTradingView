import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResultadoProceso } from "./procesar";

/** Estado final de una alerta guardada (F2 dejaba "recibida"; F3 ya no). */
export type EstadoRegistrado = "senal" | "descartada";

/** Lo que devuelve public.registrar_alerta (migración 4). */
export type Registro = {
  alerta_id: number;
  estado: EstadoRegistrado;
  motivo: string | null;
  senal_id: number | null;
};

/** Motivo con el que la base guarda una simulada que pasó el filtro sin "enviar". */
export const MOTIVO_SIMULADA_NO_ENVIADA = "Simulada: pasó el filtro, pero no se envió a EasyTrading.";

/** ¿La alerta pasó todas las reglas (aunque, por ser simulada, no se haya enviado)? */
export function pasoElFiltro(r: Pick<Registro, "estado" | "motivo">): boolean {
  return r.estado === "senal" || r.motivo === MOTIVO_SIMULADA_NO_ENVIADA;
}

export type RespuestaWebhook = {
  http: number;
  cuerpo: Record<string, unknown>;
  registro?: Registro;
};

/**
 * Guarda el resultado de procesarAlerta y arma la respuesta HTTP.
 * Las alertas pasan por el filtro de señales de la base
 * (registrar_alerta: horario, duplicadas, lista, tilde, pausa), que en la
 * misma transacción guarda la alerta y, si pasa, crea su señal.
 * Recibe el cliente con la clave secreta (lo único que puede insertar).
 * Las respuestas no dan detalles a quien manda un pedido rechazado.
 */
export async function registrarResultado(
  supabase: Pick<SupabaseClient, "from" | "rpc">,
  resultado: ResultadoProceso,
  ip: string | null,
  opciones: { enviarSimulada?: boolean } = {},
): Promise<RespuestaWebhook> {
  if (resultado.tipo === "rechazo") {
    const { error } = await supabase
      .from("intentos_rechazados")
      .insert({ ip, motivo: resultado.motivo });
    if (error) console.error("[webhook] no se pudo registrar el intento", error.code, error.message);
    return { http: resultado.http, cuerpo: { ok: false } };
  }

  const a = resultado.alerta;
  const { data, error } = await supabase.rpc("registrar_alerta", {
    p_origen: a.origen,
    p_payload: a.payload,
    p_ticker: a.ticker,
    p_estrategia: a.estrategia,
    p_accion: a.accion,
    p_precio_usd: a.precio_usd,
    p_hora_tv: a.hora_tv,
    // Datos inválidos: se guarda descartada con este motivo, sin filtrar.
    p_motivo: a.estado === "descartada" ? a.motivo : null,
    p_enviar_simulada: opciones.enviarSimulada === true,
  });
  if (error || !data) {
    console.error("[webhook] no se pudo guardar la alerta", error?.code, error?.message);
    return { http: 500, cuerpo: { ok: false } };
  }
  const registro = data as Registro;
  return {
    http: 200,
    cuerpo: { ok: true, id: registro.alerta_id, estado: registro.estado },
    registro,
  };
}
