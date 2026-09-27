import type { Activo, Estrategia } from "./schema";
import { columnasTilde } from "./tilde";

/** Una fila de la tabla activos, con el CEDEAR del mapeo embebido. */
export type ActivoFila = {
  id: number;
  ticker_usa: string;
  estrategia: Estrategia;
  onda: string | null;
  sub_onda: string | null;
  notas: string | null;
  activo: boolean;
  operar_hoy_fecha: string | null;
  tickers: { ticker_byma: string } | null;
};

/** Columnas que se piden a Supabase para armar un ActivoFila. */
export const COLUMNAS_ACTIVO =
  "id, ticker_usa, estrategia, onda, sub_onda, notas, activo, operar_hoy_fecha, tickers(ticker_byma)";

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

/**
 * 185.5 → "185.50"; null → "—". Punto decimal, como en TradingView.
 * Para mostrar el precio USD de las alertas (F2).
 */
export function formatearPrecio(v: number | null): string {
  return v === null ? "—" : formatoPrecio.format(v);
}

/** Valores iniciales (texto) del formulario de edición. */
export function valoresFormulario(fila: ActivoFila) {
  return {
    ticker_usa: fila.ticker_usa,
    onda: fila.onda ?? "",
    sub_onda: fila.sub_onda ?? "",
    notas: fila.notas ?? "",
  };
}
export type ValoresFormulario = ReturnType<typeof valoresFormulario>;
