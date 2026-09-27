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

const formatoHora = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA_AR,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Momento (timestamptz de la base) → hora de Argentina para mostrar:
 * "14:03:05" si es de hoy; "26/09 14:03:05" si es de otro día del año;
 * "26/09/2025 14:03:05" si es de otro año.
 */
export function formatearMomentoAR(momento: string | Date, ahora: Date = new Date()): string {
  const d = typeof momento === "string" ? new Date(momento) : momento;
  const hora = formatoHora.format(d);
  const [ad, am, aa] = hoyAR(d).split("-").reverse();
  const hoy = hoyAR(ahora);
  if (hoyAR(d) === hoy) return hora;
  return hoy.slice(0, 4) === aa ? `${ad}/${am} ${hora}` : `${ad}/${am}/${aa} ${hora}`;
}
