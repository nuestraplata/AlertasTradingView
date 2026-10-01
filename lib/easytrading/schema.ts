import * as z from "zod";
import { tickerByma } from "@/lib/activos/schema";

// Cuerpos que manda EasyTrading (docs/API_EASYTRADING.md). La web solo
// guarda lo que informa: no calcula nada con estos valores.

/** POST /api/easytrading/senales/{id}/resultado */
export const resultadoSchema = z.discriminatedUnion("estado", [
  z.object({
    estado: z.literal("ejecutada"),
    precio_ars: z.number().positive().lt(1e12),
    nominales: z.int().positive().lte(2_000_000_000),
    modo: z.enum(["PAPER", "REAL"]),
  }),
  z.object({
    estado: z.literal("descartada"),
    motivo: z.string().trim().min(1).max(500),
  }),
]);
export type ResultadoEasyTrading = z.infer<typeof resultadoSchema>;

/** POST /api/easytrading/posicion-cerrada (solo corto plazo). */
export const posicionCerradaSchema = z.object({
  ticker_byma: tickerByma,
  estrategia: z.literal("corto"),
  cerrada_en: z.iso.datetime({ offset: true }),
  senal_id: z.int().positive().nullish(),
});
export type PosicionCerrada = z.infer<typeof posicionCerradaSchema>;

/** Errores de validación en forma corta: { "campo": "mensaje" }. */
export function detalleDeErrores(error: z.ZodError): Record<string, string> {
  const detalle: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = issue.path.join(".") || "_";
    detalle[campo] ??= issue.message;
  }
  return detalle;
}
