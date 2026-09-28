import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compara un secreto recibido con el esperado en tiempo constante (no da
 * pistas de cuánto se acertó). Vacíos o de otro tipo → false.
 */
export function secretoCorrecto(recibido: unknown, esperado: string): boolean {
  if (typeof recibido !== "string" || recibido === "" || esperado === "") return false;
  const h = (s: string) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(h(recibido), h(esperado));
}
