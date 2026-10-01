// Cómo se muestra una señal junto a su alerta (docs/ESPECIFICACION.md §6).
// La web no calcula nada: muestra el estado y lo que informó EasyTrading.

export type EstadoSenal = "pendiente" | "tomada" | "vencida" | "ejecutada" | "descartada";

/** Fila de public.senales tal como la pide la pantalla Alertas. */
export type SenalFila = {
  id: number;
  origen: "tradingview" | "simulada";
  ticker_byma: string;
  estado: EstadoSenal;
  vence_en: string;
  tomada_en: string | null;
  resultado_en: string | null;
  resultado_precio_ars: number | null;
  resultado_nominales: number | null;
  resultado_modo: "PAPER" | "REAL" | null;
  resultado_motivo: string | null;
};

export const COLUMNAS_SENAL =
  "id, origen, ticker_byma, estado, vence_en, tomada_en, resultado_en, resultado_precio_ars, resultado_nominales, resultado_modo, resultado_motivo";

export type Tono = "espera" | "ok" | "error" | "neutro";
export type VistaSenal = { etiqueta: string; detalle: string | null; tono: Tono };

const formatoArs = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 15230.5 → "$ 15.230,50" (pesos, como los informa EasyTrading). */
export function formatearArs(v: number): string {
  return formatoArs.format(v).replace(/ /g, " ");
}

export function describirSenal(s: SenalFila, ahora: Date): VistaSenal {
  switch (s.estado) {
    case "pendiente": {
      const resta = Math.ceil((new Date(s.vence_en).getTime() - ahora.getTime()) / 1000);
      // Nadie la pidió después de vencer: la base la marca "vencida" en la
      // próxima consulta de EasyTrading. Para la pantalla ya venció.
      if (resta <= 0) return vencida(s);
      return {
        etiqueta: `Señal ${s.ticker_byma} pendiente`,
        detalle: `Esperando a EasyTrading (vence en ${resta} s)`,
        tono: "espera",
      };
    }
    case "vencida":
      return vencida(s);
    case "tomada":
      return {
        etiqueta: `Señal ${s.ticker_byma} tomada`,
        detalle: s.tomada_en
          ? `Sin resultado hace ${haceCuanto(s.tomada_en, ahora)}`
          : "EasyTrading todavía no informó el resultado",
        // Más de 2 min sin resultado: EasyTrading pudo caerse después de tomarla.
        tono: s.tomada_en && demora(s.tomada_en, ahora) > DEMORA_PREOCUPANTE_MS ? "error" : "espera",
      };
    case "ejecutada": {
      const nominales = s.resultado_nominales ?? 0;
      const precio = s.resultado_precio_ars === null ? "—" : formatearArs(Number(s.resultado_precio_ars));
      return {
        etiqueta: `Ejecutada${s.resultado_modo ? ` (${s.resultado_modo})` : ""}`,
        detalle: `${nominales} ${nominales === 1 ? "nominal" : "nominales"} de ${s.ticker_byma} a ${precio}`,
        tono: "ok",
      };
    }
    case "descartada":
      return {
        etiqueta: "Descartada por EasyTrading",
        detalle: s.resultado_motivo,
        tono: "error",
      };
  }
}

/** Tomada hace más de esto sin resultado: se marca en rojo. */
export const DEMORA_PREOCUPANTE_MS = 2 * 60_000;

function demora(desde: string, ahora: Date): number {
  return ahora.getTime() - new Date(desde).getTime();
}

/** Tiempo transcurrido, corto: "45 s", "3 min 5 s", "2 h 10 min", "3 d 4 h". */
export function haceCuanto(desde: string, ahora: Date): string {
  const s = Math.max(0, Math.floor(demora(desde, ahora) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

function vencida(s: SenalFila): VistaSenal {
  return {
    etiqueta: `Señal ${s.ticker_byma} vencida`,
    detalle: "EasyTrading no la tomó en 60 s: no se ejecuta",
    tono: "neutro",
  };
}

/**
 * Estado de la conexión con EasyTrading según su última consulta. Se
 * considera conectado si consultó en los últimos 30 s (consulta cada
 * pocos segundos; la base anota como mucho una vez cada 5 s).
 */
export function conexionEasyTrading(vistoEn: string | null, ahora: Date): "conectado" | "sin_conexion" | "nunca" {
  if (!vistoEn) return "nunca";
  return ahora.getTime() - new Date(vistoEn).getTime() <= 30_000 ? "conectado" : "sin_conexion";
}
