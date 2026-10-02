"use server";

import { revalidatePath } from "next/cache";
import { procesarAlerta } from "@/lib/alertas/procesar";
import { registrarResultado, type EstadoRegistrado } from "@/lib/alertas/registrar";
import { armarSimulacion, type Simulacion } from "@/lib/alertas/simular";
import { clienteConSesion } from "@/lib/auth/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { validarSecreto } from "@/lib/supabase/env";

export type EstadoSimulacion =
  | {
      ok: true;
      estado: EstadoRegistrado;
      id: number;
      motivo: string | null;
      senalId: number | null;
      valores: Record<string, string>;
    }
  | { ok: false; error: string; valores?: Record<string, string> }
  | undefined;

const CAMPOS = ["modo", "estrategia", "accion", "ticker", "precio", "json", "enviar"] as const;

/**
 * "Simular alerta": mismo camino que el webhook (procesarAlerta +
 * registrarResultado → filtro de señales), con origen "simulada". La
 * clave la pone el servidor. Los rechazos no se registran en
 * intentos_rechazados (no son pedidos externos): solo se muestran.
 * Si pasa el filtro, genera una señal para EasyTrading SOLO si se tildó
 * "enviar"; si no, queda descartada con ese motivo.
 */
export async function simularAlerta(
  _prev: EstadoSimulacion,
  formData: FormData,
): Promise<EstadoSimulacion> {
  await clienteConSesion(); // solo el usuario logueado

  const valores = Object.fromEntries(CAMPOS.map((c) => [c, String(formData.get(c) ?? "")]));
  const simulacion: Simulacion =
    valores.modo === "json"
      ? { modo: "json", json: valores.json, ticker: valores.ticker, precio: valores.precio }
      : {
          modo: "simple",
          estrategia: valores.estrategia,
          accion: valores.accion,
          ticker: valores.ticker,
          precio: valores.precio,
        };

  const armado = armarSimulacion(simulacion);
  if (!armado.ok) return { ok: false, error: armado.error, valores };

  let clave: string;
  let supabase: ReturnType<typeof createAdminClient>;
  try {
    clave = validarSecreto("WEBHOOK_CLAVE", process.env.WEBHOOK_CLAVE);
    supabase = createAdminClient();
  } catch (e) {
    console.error("[simular] configuración:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Falta configurar el servidor (WEBHOOK_CLAVE / SUPABASE_SECRET_KEY).", valores };
  }

  const resultado = procesarAlerta({
    cuerpo: JSON.stringify({ ...armado.mensaje, clave }),
    origen: "simulada",
    claveEsperada: clave,
    ip: null,
    ipsPermitidas: null,
  });
  if (resultado.tipo === "rechazo") {
    const texto =
      resultado.motivo === "cuerpo_demasiado_grande"
        ? "El mensaje supera los 10 KB: el webhook lo rechazaría."
        : `El webhook lo rechazaría (${resultado.motivo}).`;
    return { ok: false, error: texto, valores };
  }

  const r = await registrarResultado(supabase, resultado, null, {
    enviarSimulada: valores.enviar === "on",
  });
  if (r.http !== 200 || !r.registro) {
    return { ok: false, error: "No se pudo guardar la alerta simulada. Probá de nuevo.", valores };
  }

  revalidatePath("/alertas");
  return {
    ok: true,
    id: r.registro.alerta_id,
    estado: r.registro.estado,
    motivo: r.registro.motivo,
    senalId: r.registro.senal_id,
    // React resetea el form: se devuelven para repetir cambiando un dato.
    valores,
  };
}
