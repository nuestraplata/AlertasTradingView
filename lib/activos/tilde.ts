import { hoyAR } from "@/lib/fechas";
import type { Estrategia } from "./schema";

/** Columnas de la tabla activos que guardan el tilde. */
export type ColumnasTilde = {
  activo: boolean;
  operar_hoy_fecha: string | null;
};

/**
 * Del tilde del formulario a las columnas de la base:
 * - corto:    "activo" es un booleano que queda hasta que lo destildes.
 * - intradía: "operar hoy" se guarda como la fecha de hoy (Argentina), así
 *             se "destilda solo" al cambiar el día, sin cron.
 */
export function columnasTilde(
  estrategia: Estrategia,
  tildado: boolean,
  ahora: Date = new Date(),
): ColumnasTilde {
  if (estrategia === "corto") {
    return { activo: tildado, operar_hoy_fecha: null };
  }
  return { activo: false, operar_hoy_fecha: tildado ? hoyAR(ahora) : null };
}

/**
 * ¿El activo está tildado en este momento? Para intradía, solo si la fecha
 * guardada es hoy en Argentina. Lo usan el panel (F1) y el motor de reglas
 * (F3) para habilitar compras.
 */
export function estaTildado(
  fila: { estrategia: Estrategia } & ColumnasTilde,
  ahora: Date = new Date(),
): boolean {
  if (fila.estrategia === "corto") return fila.activo;
  return fila.operar_hoy_fecha === hoyAR(ahora);
}
