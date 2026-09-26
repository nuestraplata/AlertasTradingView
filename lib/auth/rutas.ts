export const RUTA_LOGIN = "/login";
export const RUTA_INICIO = "/";

/**
 * Rutas que no exigen sesión. Las /api públicas tienen su propia
 * autenticación (clave del webhook, token de EasyTrading).
 */
const PREFIJOS_PUBLICOS = [
  RUTA_LOGIN,
  "/api/webhook", // F2: TradingView (valida "clave")
  "/api/easytrading", // F3: EasyTrading (valida token propio)
];

/** true si la ruta es pública. Compara por segmento: "/loginx" no es "/login". */
export function esRutaPublica(pathname: string): boolean {
  return PREFIJOS_PUBLICOS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Devuelve a dónde ir después del login. Solo acepta rutas internas para
 * evitar redirecciones abiertas (p. ej. ?next=//sitio-malo.com).
 */
export function destinoSeguro(next: unknown): string {
  if (typeof next !== "string" || next === "") return RUTA_INICIO;
  if (!next.startsWith("/")) return RUTA_INICIO;
  if (next.startsWith("//") || next.startsWith("/\\")) return RUTA_INICIO;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return RUTA_INICIO;
  if (esRutaPublica(new URL(next, "http://x").pathname)) return RUTA_INICIO;
  return next;
}
