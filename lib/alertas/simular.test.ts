import { describe, expect, it } from "vitest";
import { armarSimulacion, horaComoTradingView, reemplazarPlaceholders } from "./simular";

const AHORA = new Date("2026-09-27T17:03:05.123Z");

/** El mensaje que Fran tiene configurado en TradingView (spec §4). */
const MENSAJE_TV = `{
  "clave": "CLAVE_SECRETA",
  "estrategia": "corto",
  "accion": "compra",
  "ticker": "{{ticker}}",
  "precio": "{{close}}",
  "hora": "{{timenow}}"
}`;

describe("horaComoTradingView", () => {
  it("ISO sin milisegundos, como {{timenow}}", () => {
    expect(horaComoTradingView(AHORA)).toBe("2026-09-27T17:03:05Z");
  });
});

describe("reemplazarPlaceholders", () => {
  it("reemplaza ticker, close y timenow (todas las apariciones)", () => {
    expect(
      reemplazarPlaceholders("{{ticker}} {{close}} {{timenow}} {{ticker}}", {
        ticker: "AAPL",
        precio: "185.5",
        hora: "H",
      }),
    ).toBe("AAPL 185.5 H AAPL");
  });

  it("deja otros placeholders tal cual", () => {
    expect(reemplazarPlaceholders("{{exchange}}:{{ticker}}", { ticker: "AAPL", precio: "", hora: "" })).toBe(
      "{{exchange}}:AAPL",
    );
  });
});

describe("armarSimulacion: modo simple", () => {
  it("arma el mensaje con la hora actual; sin clave", () => {
    expect(
      armarSimulacion({ modo: "simple", estrategia: "corto", accion: "compra", ticker: "AAPL", precio: "185.5" }, AHORA),
    ).toEqual({
      ok: true,
      mensaje: { estrategia: "corto", accion: "compra", ticker: "AAPL", precio: "185.5", hora: "2026-09-27T17:03:05Z" },
    });
  });

  it("no valida: los datos inválidos los descarta después procesarAlerta, como en producción", () => {
    const r = armarSimulacion({ modo: "simple", estrategia: "swing", accion: "sl", ticker: "", precio: "x" }, AHORA);
    expect(r).toMatchObject({ ok: true, mensaje: { estrategia: "swing", accion: "sl" } });
  });
});

describe("armarSimulacion: modo JSON", () => {
  it("el mensaje real de TradingView, con placeholders reemplazados", () => {
    const r = armarSimulacion({ modo: "json", json: MENSAJE_TV, ticker: "NASDAQ:AAPL", precio: "185.5" }, AHORA);
    expect(r).toEqual({
      ok: true,
      mensaje: {
        clave: "CLAVE_SECRETA", // el servidor la reemplaza por la real
        estrategia: "corto",
        accion: "compra",
        ticker: "NASDAQ:AAPL",
        precio: "185.5",
        hora: "2026-09-27T17:03:05Z",
      },
    });
  });

  it("valores con comillas no rompen el JSON", () => {
    const r = armarSimulacion({ modo: "json", json: MENSAJE_TV, ticker: 'A"B', precio: "1" }, AHORA);
    expect(r).toMatchObject({ ok: true, mensaje: { ticker: 'A"B' } });
  });

  it("JSON mal armado → error explicado (no se registra nada)", () => {
    const r = armarSimulacion({ modo: "json", json: '{"accion": "compra",}', ticker: "", precio: "" }, AHORA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/No es JSON válido.*mensaje ilegible/);
  });

  it("vacío, array o texto suelto → error", () => {
    expect(armarSimulacion({ modo: "json", json: "  ", ticker: "", precio: "" })).toEqual({
      ok: false,
      error: "Pegá el mensaje de la alerta.",
    });
    expect(armarSimulacion({ modo: "json", json: "[1]", ticker: "", precio: "" })).toMatchObject({ ok: false });
    expect(armarSimulacion({ modo: "json", json: '"hola"', ticker: "", precio: "" })).toMatchObject({ ok: false });
  });

  it("placeholders no soportados quedan literales (y procesarAlerta los marcará)", () => {
    const r = armarSimulacion(
      { modo: "json", json: '{"ticker": "{{exchange}}:{{ticker}}"}', ticker: "AAPL", precio: "" },
      AHORA,
    );
    expect(r).toMatchObject({ ok: true, mensaje: { ticker: "{{exchange}}:AAPL" } });
  });
});
