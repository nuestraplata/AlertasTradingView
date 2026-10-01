import { clienteAdmin, errorDeBase, leerId, leerJson, rechazoDeAutorizacion, responder } from "@/lib/easytrading/http";
import { detalleDeErrores, resultadoSchema } from "@/lib/easytrading/schema";

type Resultado =
  | { resultado: "registrado" | "ya_registrado"; estado: string }
  | { resultado: "no_existe" }
  | { resultado: "no_disponible"; estado: string };

/**
 * POST resultado de una señal tomada: ejecutada (precio ARS, nominales,
 * modo) o descartada por EasyTrading (motivo). La web solo lo guarda y
 * lo muestra junto a la alerta. Reenviar el mismo resultado responde 200
 * (EasyTrading puede reintentar sin miedo).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rechazo = rechazoDeAutorizacion(request);
  if (rechazo) return rechazo;

  const id = leerId((await params).id);
  if (id === null) return responder({ ok: false, error: "id_invalido" }, 400);

  const cuerpo = await leerJson(request);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const v = resultadoSchema.safeParse(cuerpo.datos);
  if (!v.success) {
    return responder({ ok: false, error: "datos_invalidos", detalle: detalleDeErrores(v.error) }, 400);
  }

  const r = v.data;
  const base = clienteAdmin();
  if (!base.ok) return base.respuesta;
  const { data, error } = await base.supabase.rpc("easytrading_resultado", {
    p_id: id,
    p_estado: r.estado,
    p_precio_ars: r.estado === "ejecutada" ? r.precio_ars : null,
    p_nominales: r.estado === "ejecutada" ? r.nominales : null,
    p_modo: r.estado === "ejecutada" ? r.modo : null,
    p_motivo: r.estado === "descartada" ? r.motivo : null,
  });
  if (error || !data) return errorDeBase("resultado", error);

  const res = data as Resultado;
  switch (res.resultado) {
    case "registrado":
    case "ya_registrado":
      return responder({ ok: true, estado: res.estado, repetido: res.resultado === "ya_registrado" });
    case "no_existe":
      return responder({ ok: false, error: "no_existe" }, 404);
    default:
      return responder({ ok: false, error: "no_disponible", estado: res.estado }, 409);
  }
}
