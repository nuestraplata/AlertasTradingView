import * as z from "zod";
import { textoONull } from "@/lib/validacion";

// Configuración editable desde el panel: horario de mercado y feriados.
// Replican las restricciones de la migración 4; la base igual las controla.

/** "11:00" (de un <input type="time">; acepta "11:00:00"). */
const hora = z
  .string({ error: "Cargá la hora." })
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Hora inválida (HH:MM).")
  .transform((h) => h.slice(0, 5));

export const horarioSchema = z
  .object({ hora_apertura: hora, hora_cierre: hora })
  .refine((h) => h.hora_apertura < h.hora_cierre, {
    path: ["hora_cierre"],
    error: "El cierre tiene que ser después de la apertura.",
  });
export type Horario = z.infer<typeof horarioSchema>;

/** "YYYY-MM-DD" que exista en el calendario (rechaza 2026-02-30). */
const fecha = z
  .string({ error: "Cargá la fecha." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.")
  .refine((f) => {
    const d = new Date(`${f}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
  }, "Fecha inválida.");

export const feriadoSchema = z.object({
  fecha,
  descripcion: z.preprocess(
    textoONull,
    z.string({ error: "Cargá una descripción." }).max(100, "Máximo 100 caracteres."),
  ),
});
export type Feriado = z.infer<typeof feriadoSchema>;

/** "11:00:00" (time de Postgres) → "11:00". */
export function horaCorta(h: string): string {
  return h.slice(0, 5);
}
