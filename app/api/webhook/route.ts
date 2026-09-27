import { ipDelPedido, ipsPermitidas } from "@/lib/alertas/ip";
import { MAX_BYTES_CUERPO, procesarAlerta, type ResultadoProceso } from "@/lib/alertas/procesar";
import { registrarResultado } from "@/lib/alertas/registrar";
import { createAdminClient } from "@/lib/supabase/admin";
import { validarSecreto } from "@/lib/supabase/env";

/**
 * Webhook de TradingView (docs/ESPECIFICACION.md §4). Público: se
 * autentica con el campo "clave" del mensaje y, en producción, con las IPs
 * de TradingView. Registra la alerta y responde enseguida (TradingView
 * corta a los 3 s). En F2 no genera señales.
 */
export async function POST(request: Request) {
  let claveEsperada: string;
  let supabase: ReturnType<typeof createAdminClient>;
  try {
    claveEsperada = validarSecreto("WEBHOOK_CLAVE", process.env.WEBHOOK_CLAVE);
    supabase = createAdminClient();
  } catch (e) {
    // Falta configuración en el servidor: no es culpa de quien manda.
    console.error("[webhook] configuración:", e instanceof Error ? e.message : e);
    return Response.json({ ok: false }, { status: 500 });
  }

  const ip = ipDelPedido(request.headers);

  // Si avisa que es enorme, ni se lee.
  const largo = Number(request.headers.get("content-length") ?? "0");
  const resultado: ResultadoProceso =
    largo > MAX_BYTES_CUERPO
      ? { tipo: "rechazo", motivo: "cuerpo_demasiado_grande", http: 413 }
      : procesarAlerta({
          cuerpo: await request.text(),
          origen: "tradingview",
          claveEsperada,
          ip,
          ipsPermitidas: ipsPermitidas(process.env.VERCEL_ENV),
        });

  const respuesta = await registrarResultado(supabase, resultado, ip);
  return Response.json(respuesta.cuerpo, { status: respuesta.http });
}
