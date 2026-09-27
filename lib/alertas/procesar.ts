import { createHash, timingSafeEqual } from "node:crypto";
import { ESTRATEGIAS, tickerUsa, type Estrategia } from "@/lib/activos/schema";

// Procesa el cuerpo de un pedido al webhook (o de "simular alerta") y
// decide qué guardar. Función pura: no toca la base ni la red. El mismo
// camino sirve para TradingView y para el simulador (docs/ESPECIFICACION.md §4).

export const MAX_BYTES_CUERPO = 10_000;
export const ACCIONES = ["compra", "venta"] as const;
export type Accion = (typeof ACCIONES)[number];
export type Origen = "tradingview" | "simulada";

export type MotivoRechazo =
  | "clave_invalida"
  | "ip_no_permitida"
  | "mensaje_ilegible"
  | "cuerpo_demasiado_grande";

/** Fila a insertar en public.alertas (sin id ni recibida_en). */
export type AlertaNueva = {
  origen: Origen;
  payload: Record<string, unknown>;
  ticker: string | null;
  estrategia: Estrategia | null;
  accion: Accion | null;
  precio_usd: number | null;
  hora_tv: string | null;
  estado: "recibida" | "descartada";
  motivo: string | null;
};

export type ResultadoProceso =
  | { tipo: "rechazo"; motivo: MotivoRechazo; http: 400 | 401 | 403 | 413 }
  | { tipo: "alerta"; alerta: AlertaNueva; http: 200 };

export type EntradaProceso = {
  cuerpo: string;
  origen: Origen;
  claveEsperada: string;
  /** IP del pedido (null si no se sabe). */
  ip: string | null;
  /** IPs aceptadas; null = no filtrar por IP (desarrollo, simulador). */
  ipsPermitidas: readonly string[] | null;
};

export function procesarAlerta(e: EntradaProceso): ResultadoProceso {
  if (Buffer.byteLength(e.cuerpo, "utf8") > MAX_BYTES_CUERPO) {
    return { tipo: "rechazo", motivo: "cuerpo_demasiado_grande", http: 413 };
  }
  if (e.ipsPermitidas && (!e.ip || !e.ipsPermitidas.includes(e.ip))) {
    return { tipo: "rechazo", motivo: "ip_no_permitida", http: 403 };
  }

  let datos: unknown;
  try {
    datos = JSON.parse(e.cuerpo);
  } catch {
    return { tipo: "rechazo", motivo: "mensaje_ilegible", http: 400 };
  }
  if (typeof datos !== "object" || datos === null || Array.isArray(datos)) {
    return { tipo: "rechazo", motivo: "mensaje_ilegible", http: 400 };
  }

  const { clave, ...payload } = datos as Record<string, unknown>;
  if (!claveCorrecta(clave, e.claveEsperada)) {
    return { tipo: "rechazo", motivo: "clave_invalida", http: 401 };
  }

  return { tipo: "alerta", alerta: armarAlerta(payload, e.origen), http: 200 };
}

/** Compara en tiempo constante (no da pistas de cuánto se acertó). */
function claveCorrecta(recibida: unknown, esperada: string): boolean {
  if (typeof recibida !== "string" || recibida === "" || esperada === "") return false;
  const h = (s: string) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(h(recibida), h(esperada));
}

type Campo<T> = { valor: T | null; error: string | null };

function armarAlerta(payload: Record<string, unknown>, origen: Origen): AlertaNueva {
  const ticker = leerTicker(payload.ticker);
  const estrategia = leerOpcion("estrategia", payload.estrategia, ESTRATEGIAS);
  const accion = leerOpcion("accion", payload.accion, ACCIONES);
  const precio = leerPrecio(payload.precio);
  const hora = typeof payload.hora === "string" ? payload.hora.trim().slice(0, 50) || null : null;

  const errores = [estrategia, accion, ticker, precio]
    .map((c) => c.error)
    .filter((m): m is string => m !== null);

  return {
    origen,
    payload,
    ticker: ticker.valor,
    estrategia: estrategia.valor,
    accion: accion.valor,
    precio_usd: precio.valor,
    hora_tv: hora,
    estado: errores.length ? "descartada" : "recibida",
    motivo: errores.length ? errores.join(" ").slice(0, 500) : null,
  };
}

function mostrar(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 30 ? `${s.slice(0, 30)}…` : s;
}

function leerOpcion<T extends string>(
  campo: string,
  v: unknown,
  opciones: readonly T[],
): Campo<T> {
  if (v === undefined || v === null || v === "") {
    return { valor: null, error: `Falta "${campo}".` };
  }
  const s = typeof v === "string" ? v.trim().toLowerCase() : v;
  if (typeof s === "string" && (opciones as readonly string[]).includes(s)) {
    return { valor: s as T, error: null };
  }
  return {
    valor: null,
    error: `"${campo}" inválida: "${mostrar(v)}" (válidas: ${opciones.join(", ")}).`,
  };
}

/** "NASDAQ:AAPL" → "AAPL"; en mayúsculas; mismo formato que Tickers. */
function leerTicker(v: unknown): Campo<string> {
  if (typeof v !== "string" || v.trim() === "") return { valor: null, error: 'Falta "ticker".' };
  const sinPrefijo = v.trim().replace(/^[A-Za-z0-9_]+:/, "");
  const r = tickerUsa.safeParse(sinPrefijo);
  return r.success
    ? { valor: r.data, error: null }
    : { valor: null, error: `"ticker" inválido: "${mostrar(v)}".` };
}

/**
 * {{close}} de TradingView: número o texto con punto decimal. Es solo
 * registro, así que no se rechaza por tener muchos decimales: se redondea
 * a 6 (lo que guarda la columna).
 */
function leerPrecio(v: unknown): Campo<number> {
  if (v === undefined || v === null || v === "") return { valor: null, error: 'Falta "precio".' };
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim().replace(",", ".") : "";
  const n = /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n >= 1e12) {
    return { valor: null, error: `"precio" inválido: "${mostrar(v)}".` };
  }
  return { valor: Math.round(n * 1e6) / 1e6, error: null };
}
