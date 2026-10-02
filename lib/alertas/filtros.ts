import { ESTRATEGIAS, type Estrategia } from "@/lib/activos/schema";
import { ACCIONES, type Accion, type Origen } from "./procesar";

// Filtros de la pantalla Alertas. Viven en la URL (?estrategia=corto&...),
// así funcionan sin JavaScript, se pueden guardar y el botón "atrás" anda.

// "recibida": alertas de F2, que todavía no pasaban por el filtro de señales.
export const ESTADOS = ["senal", "descartada", "recibida"] as const;
export const ORIGENES = ["tradingview", "simulada"] as const;
export type EstadoAlerta = (typeof ESTADOS)[number];

export const PASO = 100;
export const LIMITE_MAX = 1000;

export type Filtros = {
  estrategia: Estrategia | null;
  accion: Accion | null;
  estado: EstadoAlerta | null;
  origen: Origen | null;
  limite: number;
};

type Params = Record<string, string | string[] | undefined>;

function uno<T extends string>(v: string | string[] | undefined, validos: readonly T[]): T | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && (validos as readonly string[]).includes(s) ? (s as T) : null;
}

/** De los searchParams de la página a filtros válidos (lo inválido se ignora). */
export function leerFiltros(p: Params): Filtros {
  const n = Number(Array.isArray(p.limite) ? p.limite[0] : p.limite);
  const limite = Number.isInteger(n) && n > 0 ? Math.min(Math.ceil(n / PASO) * PASO, LIMITE_MAX) : PASO;
  return {
    estrategia: uno(p.estrategia, ESTRATEGIAS),
    accion: uno(p.accion, ACCIONES),
    estado: uno(p.estado, ESTADOS),
    origen: uno(p.origen, ORIGENES),
    limite,
  };
}

/**
 * URL de la pantalla con un filtro cambiado (null = quitarlo). Cambiar un
 * filtro vuelve a las primeras 100.
 */
export function urlAlertas(f: Filtros, cambio: Partial<Filtros>): string {
  const n = { ...f, limite: PASO, ...cambio };
  const q = new URLSearchParams();
  for (const k of ["estrategia", "accion", "estado", "origen"] as const) {
    if (n[k]) q.set(k, n[k]);
  }
  if (n.limite !== PASO) q.set("limite", String(n.limite));
  const s = q.toString();
  return s ? `/alertas?${s}` : "/alertas";
}

export function hayFiltros(f: Filtros): boolean {
  return Boolean(f.estrategia || f.accion || f.estado || f.origen);
}
