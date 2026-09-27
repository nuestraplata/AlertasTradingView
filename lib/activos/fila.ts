import type { Activo, Estrategia, Modo } from "./schema";
import { columnasTilde } from "./tilde";

/** Una fila de la tabla activos, con el CEDEAR del mapeo embebido. */
export type ActivoFila = {
  id: number;
  ticker_usa: string;
  estrategia: Estrategia;
  nominales: number;
  nominales_max: number;
  entrada_usd: number | null;
  tp_usd: number | null;
  sl_usd: number | null;
  onda: string | null;
  sub_onda: string | null;
  notas: string | null;
  modo: Modo;
  activo: boolean;
  operar_hoy_fecha: string | null;
  tickers: { ticker_byma: string } | null;
};

/** Columnas que se piden a Supabase para armar un ActivoFila. */
export const COLUMNAS_ACTIVO =
  "id, ticker_usa, estrategia, nominales, nominales_max, entrada_usd, tp_usd, sl_usd, onda, sub_onda, notas, modo, activo, operar_hoy_fecha, tickers(ticker_byma)";

/** Datos validados del formulario → columnas a guardar en la base. */
export function filaParaGuardar(
  datos: Activo,
  ahora: Date = new Date(),
): Omit<ActivoFila, "id" | "tickers"> {
  const { tildado, ...resto } = datos;
  return { ...resto, ...columnasTilde(datos.estrategia, tildado, ahora) };
}

const formatoPrecio = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
  useGrouping: false,
});

/** 185.5 → "185.50"; null → "—". Punto decimal, como en TradingView. */
export function formatearPrecio(v: number | null): string {
  return v === null ? "—" : formatoPrecio.format(v);
}

/** Valores iniciales (texto) del formulario de edición. */
export function valoresFormulario(fila: ActivoFila) {
  const txt = (v: number | string | null) => (v === null ? "" : String(v));
  return {
    ticker_usa: fila.ticker_usa,
    nominales: txt(fila.nominales),
    nominales_max: txt(fila.nominales_max),
    entrada_usd: txt(fila.entrada_usd),
    tp_usd: txt(fila.tp_usd),
    sl_usd: txt(fila.sl_usd),
    onda: txt(fila.onda),
    sub_onda: txt(fila.sub_onda),
    notas: txt(fila.notas),
    modo: fila.modo,
  };
}
export type ValoresFormulario = ReturnType<typeof valoresFormulario>;
