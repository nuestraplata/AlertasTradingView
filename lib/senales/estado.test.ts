import { describe, expect, it } from "vitest";
import { conexionEasyTrading, describirSenal, formatearArs, haceCuanto, type SenalFila } from "./estado";

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

  it("tomada sin resultado: cuánto hace", () => {
    expect(describirSenal({ ...base, estado: "tomada", tomada_en: "2026-10-01T17:00:00Z" }, AHORA)).toEqual({
      etiqueta: "Señal AAPL tomada",
      detalle: "Sin resultado hace 30 s",
      tono: "espera",
    });
  });

  it("tomada sin resultado hace más de 2 min → en rojo", () => {
    expect(describirSenal({ ...base, estado: "tomada", tomada_en: "2026-10-01T16:58:29Z" }, AHORA)).toMatchObject({
      detalle: "Sin resultado hace 2 min 1 s",
      tono: "error",
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

describe("haceCuanto", () => {
  const desde = (segundos: number) => new Date(AHORA.getTime() - segundos * 1000).toISOString();
  it.each([
    [0, "0 s"],
    [59, "59 s"],
    [60, "1 min"],
    [125, "2 min 5 s"],
    [3600, "1 h"],
    [3600 * 2 + 600, "2 h 10 min"],
    [86400 * 3 + 3600 * 4, "3 d 4 h"],
    [86400, "1 d"],
  ])("%i s → %s", (segundos, texto) => {
    expect(haceCuanto(desde(segundos), AHORA)).toBe(texto);
  });

  it("una hora futura (relojes desfasados) no da negativo", () => {
    expect(haceCuanto(desde(-5), AHORA)).toBe("0 s");
  });
});
