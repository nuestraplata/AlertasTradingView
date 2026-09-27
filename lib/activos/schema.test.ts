import { describe, expect, it } from "vitest";
import { erroresPorCampo } from "@/lib/validacion";
import { activoSchema, cambioTildeSchema, tickerSchema } from "./schema";

/** Simula lo que manda un formulario: todo texto, checkbox ausente = sin tildar. */
const base = {
  ticker_usa: "aapl",
  estrategia: "corto",
  onda: "",
  sub_onda: "",
  notas: "",
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
  it("formulario mínimo: normaliza, vacíos → null, sin tildar", () => {
    expect(activoSchema.parse(base)).toEqual({
      ticker_usa: "AAPL",
      estrategia: "corto",
      onda: null,
      sub_onda: null,
      notas: null,
      tildado: false,
    });
  });

  it("formulario completo con tilde", () => {
    expect(
      activoSchema.parse({
        ...base,
        estrategia: "intradia",
        onda: " 3 ",
        sub_onda: "b",
        notas: "rompe máximo",
        tildado: "on",
      }),
    ).toEqual({
      ticker_usa: "AAPL",
      estrategia: "intradia",
      onda: "3",
      sub_onda: "b",
      notas: "rompe máximo",
      tildado: true,
    });
  });

  it("tildar no requiere ningún otro campo", () => {
    expect(activoSchema.parse({ ...base, tildado: "on" }).tildado).toBe(true);
  });

  it("ignora campos que ya no existen (nominales, SL, modo…)", () => {
    const a = activoSchema.parse({ ...base, nominales: "5", sl_usd: "180", modo: "REAL" });
    expect(a).not.toHaveProperty("nominales");
    expect(a).not.toHaveProperty("sl_usd");
    expect(a).not.toHaveProperty("modo");
  });

  it("estrategia inválida", () => {
    expect(errores({ ...base, estrategia: "swing" }).estrategia).toBe("Estrategia inválida.");
  });

  it("límites de texto", () => {
    expect(errores({ ...base, onda: "x".repeat(51) }).onda).toMatch(/50/);
    expect(errores({ ...base, sub_onda: "x".repeat(51) }).sub_onda).toMatch(/50/);
    expect(errores({ ...base, notas: "x".repeat(2001) }).notas).toMatch(/2000/);
    expect(activoSchema.parse({ ...base, notas: "x".repeat(2000) }).notas).toHaveLength(2000);
  });

  it("reporta varios campos a la vez", () => {
    const e = errores({ ...base, ticker_usa: "", estrategia: "x", onda: "x".repeat(51) });
    expect(Object.keys(e).sort()).toEqual(["estrategia", "onda", "ticker_usa"]);
  });
});

describe("cambioTildeSchema", () => {
  it("acepta id entero positivo, estrategia válida y booleano", () => {
    expect(cambioTildeSchema.parse({ id: 7, estrategia: "intradia", tildado: true })).toEqual({
      id: 7,
      estrategia: "intradia",
      tildado: true,
    });
  });

  it.each([
    { id: 0, estrategia: "corto", tildado: true },
    { id: 1.5, estrategia: "corto", tildado: true },
    { id: "7", estrategia: "corto", tildado: true },
    { id: 7, estrategia: "swing", tildado: true },
    { id: 7, estrategia: "corto", tildado: "on" },
  ])("rechaza datos manipulados: %j", (datos) => {
    expect(cambioTildeSchema.safeParse(datos).success).toBe(false);
  });
});
