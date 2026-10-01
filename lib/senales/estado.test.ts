import { describe, expect, it } from "vitest";
import { conexionEasyTrading, describirSenal, formatearArs, type SenalFila } from "./estado";

const AHORA = new Date("2026-10-01T17:00:30Z");
const base: SenalFila = {
  id: 1,
  origen: "tradingview",
  ticker_byma: "AAPL",
  estado: "pendiente",
  vence_en: "2026-10-01T17:01:00Z",
  tomada_en: null,
  resultado_en: null,
  resultado_precio_ars: null,
  resultado_nominales: null,
  resultado_modo: null,
  resultado_motivo: null,
};

describe("describirSenal", () => {
  it("pendiente: cuánto falta para vencer", () => {
    expect(describirSenal(base, AHORA)).toEqual({
      etiqueta: "Señal AAPL pendiente",
      detalle: "Esperando a EasyTrading (vence en 30 s)",
      tono: "espera",
    });
  });

  it("pendiente pero ya pasó vence_en → se muestra vencida", () => {
    expect(describirSenal({ ...base, vence_en: "2026-10-01T17:00:30Z" }, AHORA)).toMatchObject({
      etiqueta: "Señal AAPL vencida",
      tono: "neutro",
    });
  });

  it("vencida", () => {
    expect(describirSenal({ ...base, estado: "vencida" }, AHORA).detalle).toMatch(/no la tomó en 60 s/);
  });

  it("tomada sin resultado", () => {
    expect(describirSenal({ ...base, estado: "tomada", tomada_en: "x" }, AHORA)).toMatchObject({
      etiqueta: "Señal AAPL tomada",
      tono: "espera",
    });
  });

  it("ejecutada: nominales, precio en pesos y modo", () => {
    expect(
      describirSenal(
        { ...base, estado: "ejecutada", resultado_nominales: 10, resultado_precio_ars: 15230.5, resultado_modo: "PAPER" },
        AHORA,
      ),
    ).toEqual({ etiqueta: "Ejecutada (PAPER)", detalle: "10 nominales de AAPL a $ 15.230,50", tono: "ok" });
  });

  it("ejecutada con 1 nominal (singular) y precio como texto (numeric de Postgres)", () => {
    const fila = { ...base, estado: "ejecutada" as const, resultado_nominales: 1, resultado_modo: "REAL" as const };
    expect(describirSenal({ ...fila, resultado_precio_ars: "1000" as unknown as number }, AHORA).detalle).toBe(
      "1 nominal de AAPL a $ 1.000,00",
    );
  });

  it("descartada por EasyTrading: muestra su motivo", () => {
    expect(
      describirSenal({ ...base, estado: "descartada", resultado_motivo: "sin posición abierta" }, AHORA),
    ).toEqual({ etiqueta: "Descartada por EasyTrading", detalle: "sin posición abierta", tono: "error" });
  });
});

describe("formatearArs", () => {
  it("formato argentino", () => {
    expect(formatearArs(1234567.891)).toBe("$ 1.234.567,89");
  });
});

describe("conexionEasyTrading", () => {
  it("nunca consultó", () => expect(conexionEasyTrading(null, AHORA)).toBe("nunca"));
  it("consultó hace 30 s → conectado", () =>
    expect(conexionEasyTrading("2026-10-01T17:00:00Z", AHORA)).toBe("conectado"));
  it("consultó hace 31 s → sin conexión", () =>
    expect(conexionEasyTrading("2026-10-01T16:59:59Z", AHORA)).toBe("sin_conexion"));
});
