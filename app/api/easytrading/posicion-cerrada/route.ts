import { clienteAdmin, errorDeBase, leerJson, rechazoDeAutorizacion, responder } from "@/lib/easytrading/http";
import { detalleDeErrores, posicionCerradaSchema } from "@/lib/easytrading/schema";

/**
 * POST aviso de posición de CORTO cerrada (docs/ESPECIFICACION.md §8):
 * la web destilda "activo" en corto para ese CEDEAR y registra el aviso.
 * Siempre 200 si el pedido es válido (también si ya estaba destildado o
 * no está en la lista): EasyTrading puede reintentar el mismo aviso.
 */
export async function POST(request: Request) {
  const rechazo = rechazoDeAutorizacion(request);
  if (rechazo) return rechazo;

  const cuerpo = await leerJson(request);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const v = posicionCerradaSchema.safeParse(cuerpo.datos);
  if (!v.success) {
    return responder({ ok: false, error: "datos_invalidos", detalle: detalleDeErrores(v.error) }, 400);
  }

  const base = clienteAdmin();
  if (!base.ok) return base.respuesta;
  const { data, error } = await base.supabase.rpc("easytrading_posicion_cerrada", {
    p_ticker_byma: v.data.ticker_byma,
    p_cerrada_en: v.data.cerrada_en,
    p_senal_id: v.data.senal_id ?? null,
  });
  if (error || !data) return errorDeBase("posicion-cerrada", error);
  return responder({ ok: true, ...(data as Record<string, unknown>) });
}
