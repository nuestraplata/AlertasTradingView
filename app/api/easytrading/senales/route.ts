import { clienteAdmin, errorDeBase, rechazoDeAutorizacion, responder } from "@/lib/easytrading/http";

/**
 * GET señales pendientes (docs/API_EASYTRADING.md). EasyTrading consulta
 * cada pocos segundos (modelo pull: la PC nunca se expone). De paso vence
 * las señales de más de 60 s y anota la hora de la consulta (el panel
 * muestra si EasyTrading está conectado). En pausa devuelve la lista vacía.
 */
export async function GET(request: Request) {
  const rechazo = rechazoDeAutorizacion(request);
  if (rechazo) return rechazo;

  const base = clienteAdmin();
  if (!base.ok) return base.respuesta;
  const { data, error } = await base.supabase.rpc("easytrading_pendientes");
  if (error || !data) return errorDeBase("pendientes", error);
  return responder({ ok: true, ...(data as Record<string, unknown>) });
}
