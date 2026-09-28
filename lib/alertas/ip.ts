/**
 * IPs desde las que TradingView manda los webhooks. Fuente oficial,
 * verificada el 27/09/2026:
 * https://www.tradingview.com/support/solutions/43000529348-how-to-configure-webhook-alerts/
 * Si TradingView las cambia, las alertas llegan como "ip_no_permitida" en
 * Intentos rechazados: actualizar esta lista.
 */
export const IPS_TRADINGVIEW = [
  "52.89.214.238",
  "34.212.75.30",
  "54.218.53.128",
  "52.32.178.7",
] as const;

/**
 * IP del pedido. En Vercel, x-real-ip y el primer valor de x-forwarded-for
 * los pone Vercel (el cliente no puede falsificarlos). En local no hay.
 */
export function ipDelPedido(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 100);
  const primera = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return primera ? primera.slice(0, 100) : null;
}

/**
 * Solo en producción se filtra por IP: en local y en los previews de
 * Vercel se prueba con PowerShell / curl, que no salen de esas IPs.
 */
export function ipsPermitidas(vercelEnv: string | undefined): readonly string[] | null {
  return vercelEnv === "production" ? IPS_TRADINGVIEW : null;
}
