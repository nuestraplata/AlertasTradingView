import { describe, expect, it } from "vitest";
import { erroresPorCampo } from "@/lib/validacion";
import { activoSchema, tickerSchema } from "./schema";

/** Simula lo que manda un formulario: todo texto, checkbox ausente = sin tildar. */
const base = {
  ticker_usa: "aapl",
  estrategia: "corto",
  nominales: "5",
  nominales_max: "",
  entrada_usd: "",
  tp_usd: "",
  sl_usd: "",
  onda: "",
  sub_onda: "",
  notas: "",
  modo: "",
};

function errores(datos: Record<string, unknown>) {
  const r = activoSchema.safeParse(datos);
  expect(r.success).toBe(false);
  return erroresPorCampo(r.error!);
}

describe("tickerSchema", () => {
  it("pasa a mayúsculas y recorta", () => {
    expect(tickerSchema.parse({ ticker_usa: " brk.b ", ticker_byma: "brkb" })).toEqual({
      ticker_usa: "BRK.B",
      ticker_byma: "BRKB",
    });
  });

  it("rechaza BYMA con sufijo o caracteres raros", () => {
    const r = tickerSchema.safeParse({ ticker_usa: "AAPL", ticker_byma: "AAPL.BA" });
    expect(r.success).toBe(false);
    expect(erroresPorCampo(r.error!).ticker_byma).toMatch(/sin sufijo/);
  });

  it("rechaza vacíos y tickers demasiado largos", () => {
    const r = tickerSchema.safeParse({ ticker_usa: "", ticker_byma: "ABCDEFGHIJK" });
    expect(r.success).toBe(false);
    const e = erroresPorCampo(r.error!);
    expect(e.ticker_usa).toBe("Cargá el ticker USA.");
    expect(e.ticker_byma).toMatch(/máx\. 10/);
  });
});

describe("activoSchema", () => {
  it("formulario mínimo: normaliza y completa valores por defecto", () => {
    expect(activoSchema.parse(base)).toEqual({
      ticker_usa: "AAPL",
      estrategia: "corto",
      nominales: 5,
      nominales_max: 15, // 3 × nominales
      entrada_usd: null,
      tp_usd: null,
      sl_usd: null,
      onda: null,
      sub_onda: null,
      notas: null,
      modo: "PAPER",
      tildado: false,
    });
  });

  it("formulario completo con coma decimal y tilde", () => {
    const a = activoSchema.parse({
      ...base,
      estrategia: "intradia",
      nominales_max: "8",
      entrada_usd: "185,50",
      tp_usd: "200",
      sl_usd: "180.25",
      onda: " 3 ",
      notas: "rompe máximo",
      modo: "REAL",
      tildado: "on",
    });
    expect(a).toMatchObject({
      estrategia: "intradia",
      nominales_max: 8,
      entrada_usd: 185.5,
      tp_usd: 200,
      sl_usd: 180.25,
      onda: "3",
      notas: "rompe máximo",
      modo: "REAL",
      tildado: true,
    });
  });

  it("nominales tienen que ser enteros positivos", () => {
    expect(errores({ ...base, nominales: "0" }).nominales).toMatch(/mayor a 0/);
    expect(errores({ ...base, nominales: "2.5" }).nominales).toMatch(/entero/);
    expect(errores({ ...base, nominales: "" }).nominales).toMatch(/entero/);
  });

  it("el tope no puede ser menor que los nominales", () => {
    expect(errores({ ...base, nominales_max: "4" }).nominales_max).toMatch(/tope/);
  });

  it("SL < entrada solo si hay entrada", () => {
    expect(errores({ ...base, entrada_usd: "100", sl_usd: "100" }).sl_usd).toMatch(
      /menor que la entrada/,
    );
    expect(activoSchema.parse({ ...base, sl_usd: "100" }).sl_usd).toBe(100);
    expect(activoSchema.parse({ ...base, entrada_usd: "100", sl_usd: "99.99" }).sl_usd).toBe(
      99.99,
    );
  });

  it("sin SL no se puede tildar (mensaje según estrategia)", () => {
    expect(errores({ ...base, tildado: "on" }).sl_usd).toMatch(/"activo"/);
    expect(errores({ ...base, estrategia: "intradia", tildado: "on" }).sl_usd).toMatch(
      /"operar hoy"/,
    );
  });

  it("TP es solo anotación: no se compara con entrada ni SL", () => {
    expect(
      activoSchema.parse({ ...base, entrada_usd: "100", sl_usd: "90", tp_usd: "50" }).tp_usd,
    ).toBe(50);
  });

  it("precios inválidos", () => {
    expect(errores({ ...base, entrada_usd: "1.234,5" }).entrada_usd).toMatch(/separador/);
    expect(errores({ ...base, sl_usd: "0" }).sl_usd).toMatch(/mayor a 0/);
    expect(errores({ ...base, tp_usd: "-1" }).tp_usd).toMatch(/Número inválido/);
  });

  it("estrategia y modo inválidos", () => {
    const e = errores({ ...base, estrategia: "swing", modo: "real" });
    expect(e.estrategia).toBe("Estrategia inválida.");
    expect(e.modo).toBe("Modo inválido.");
  });

  it("límites de texto", () => {
    expect(errores({ ...base, onda: "x".repeat(51) }).onda).toMatch(/50/);
    expect(errores({ ...base, notas: "x".repeat(2001) }).notas).toMatch(/2000/);
    expect(activoSchema.parse({ ...base, notas: "x".repeat(2000) }).notas).toHaveLength(2000);
  });

  it("reporta varios campos a la vez", () => {
    const e = errores({ ...base, ticker_usa: "", nominales: "x", sl_usd: "abc" });
    expect(Object.keys(e).sort()).toEqual(["nominales", "sl_usd", "ticker_usa"]);
  });
});
