import { describe, expect, it } from "vitest";
import { filaParaGuardar, formatearPrecio, valoresFormulario, type ActivoFila } from "./fila";
import { activoSchema } from "./schema";

const NOCHE_AR = new Date("2026-09-27T01:30:00Z"); // 26/09 22:30 en Argentina

const formulario = {
  ticker_usa: "AAPL",
  nominales: "5",
  nominales_max: "",
  entrada_usd: "185,5",
  tp_usd: "",
  sl_usd: "180",
  onda: "",
  sub_onda: "",
  notas: "",
  modo: "PAPER",
  tildado: "on",
};

describe("filaParaGuardar", () => {
  it("corto: tildado → activo = true, sin fecha", () => {
    const datos = activoSchema.parse({ ...formulario, estrategia: "corto" });
    expect(filaParaGuardar(datos, NOCHE_AR)).toEqual({
      ticker_usa: "AAPL",
      estrategia: "corto",
      nominales: 5,
      nominales_max: 15,
      entrada_usd: 185.5,
      tp_usd: null,
      sl_usd: 180,
      onda: null,
      sub_onda: null,
      notas: null,
      modo: "PAPER",
      activo: true,
      operar_hoy_fecha: null,
    });
  });

  it("intradía: tildado → fecha de hoy en Argentina; no manda 'tildado' a la base", () => {
    const datos = activoSchema.parse({ ...formulario, estrategia: "intradia" });
    const fila = filaParaGuardar(datos, NOCHE_AR);
    expect(fila).toMatchObject({ activo: false, operar_hoy_fecha: "2026-09-26" });
    expect(fila).not.toHaveProperty("tildado");
  });
});

describe("formatearPrecio", () => {
  it("mínimo 2 decimales, hasta 6, punto decimal, sin separador de miles", () => {
    expect(formatearPrecio(185.5)).toBe("185.50");
    expect(formatearPrecio(1650)).toBe("1650.00");
    expect(formatearPrecio(0.123456)).toBe("0.123456");
    expect(formatearPrecio(null)).toBe("—");
  });
});

describe("valoresFormulario", () => {
  it("convierte la fila a texto para los inputs; null → vacío", () => {
    const fila: ActivoFila = {
      id: 1,
      ticker_usa: "AAPL",
      estrategia: "corto",
      nominales: 5,
      nominales_max: 15,
      entrada_usd: 185.5,
      tp_usd: null,
      sl_usd: 180,
      onda: "3",
      sub_onda: null,
      notas: null,
      modo: "REAL",
      activo: true,
      operar_hoy_fecha: null,
      tickers: { ticker_byma: "AAPL" },
    };
    expect(valoresFormulario(fila)).toEqual({
      ticker_usa: "AAPL",
      nominales: "5",
      nominales_max: "15",
      entrada_usd: "185.5",
      tp_usd: "",
      sl_usd: "180",
      onda: "3",
      sub_onda: "",
      notas: "",
      modo: "REAL",
    });
  });
});
