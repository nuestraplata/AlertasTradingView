/** Zona horaria de todas las fechas y horarios de negocio. */
export const ZONA_AR = "America/Argentina/Buenos_Aires";

const formatoFecha = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_AR,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Fecha de hoy en Argentina como "YYYY-MM-DD" (el formato de una columna
 * date de Postgres). No depende de la zona horaria del servidor: Vercel
 * corre en UTC, y entre las 21:00 y las 23:59 de Argentina UTC ya es
 * "mañana".
 */
export function hoyAR(ahora: Date = new Date()): string {
  const partes = Object.fromEntries(
    formatoFecha.formatToParts(ahora).map((p) => [p.type, p.value]),
  );
  return `${partes.year}-${partes.month}-${partes.day}`;
}
