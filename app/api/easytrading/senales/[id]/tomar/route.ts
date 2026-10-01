import { clienteAdmin, errorDeBase, leerId, rechazoDeAutorizacion, responder } from "@/lib/easytrading/http";

type Tomar =
  | { resultado: "tomada"; senal: Record<string, unknown> }
  | { resultado: "no_existe" }
  | { resultado: "pausado" | "no_disponible"; estado: string };

/**
 * POST tomar una señal: pendiente → tomada, atómico. Solo si responde 200
 * EasyTrading puede ejecutarla. 409 = ya la tomó alguien, venció o el
 * envío está en pausa: NO ejecutar.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rechazo = rechazoDeAutorizacion(request);
  if (rechazo) return rechazo;

  const id = leerId((await params).id);
  if (id === null) return responder({ ok: false, error: "id_invalido" }, 400);

  const base = clienteAdmin();
  if (!base.ok) return base.respuesta;
  const { data, error } = await base.supabase.rpc("easytrading_tomar", { p_id: id });
  if (error || !data) return errorDeBase("tomar", error);

  const r = data as Tomar;
  switch (r.resultado) {
    case "tomada":
      return responder({ ok: true, senal: r.senal });
    case "no_existe":
      return responder({ ok: false, error: "no_existe" }, 404);
    default:
      return responder({ ok: false, error: r.resultado, estado: r.estado }, 409);
  }
}
