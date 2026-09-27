import { describe, expect, it } from "vitest";
import { columnasTilde, estaTildado } from "./tilde";

// 26/09/2026 22:30 en Argentina = 27/09/2026 01:30 UTC.
const NOCHE_AR = new Date("2026-09-27T01:30:00Z");
// Al día siguiente, 00:00:01 en Argentina.
const MANIANA_AR = new Date("2026-09-27T03:00:01Z");

describe("columnasTilde", () => {
  it("corto: el tilde es un booleano y nunca guarda fecha", () => {
    expect(columnasTilde("corto", true, NOCHE_AR)).toEqual({
      activo: true,
      operar_hoy_fecha: null,
    });
    expect(columnasTilde("corto", false, NOCHE_AR)).toEqual({
      activo: false,
      operar_hoy_fecha: null,
    });
  });

  it("intradía: tildar guarda la fecha de hoy en Argentina (no la de UTC)", () => {
    expect(columnasTilde("intradia", true, NOCHE_AR)).toEqual({
      activo: false,
      operar_hoy_fecha: "2026-09-26",
    });
  });

  it("intradía: destildar borra la fecha", () => {
    expect(columnasTilde("intradia", false, NOCHE_AR)).toEqual({
      activo: false,
      operar_hoy_fecha: null,
    });
  });
});

describe("estaTildado", () => {
  it("corto: depende solo del booleano, no del día", () => {
    const fila = { estrategia: "corto" as const, activo: true, operar_hoy_fecha: null };
    expect(estaTildado(fila, NOCHE_AR)).toBe(true);
    expect(estaTildado(fila, MANIANA_AR)).toBe(true);
    expect(estaTildado({ ...fila, activo: false }, NOCHE_AR)).toBe(false);
  });

  it("intradía: tildado hoy vale hoy y se destilda solo al día siguiente", () => {
    const fila = {
      estrategia: "intradia" as const,
      ...columnasTilde("intradia", true, NOCHE_AR),
    };
    expect(estaTildado(fila, NOCHE_AR)).toBe(true);
    expect(estaTildado(fila, MANIANA_AR)).toBe(false);
  });

  it("intradía: sin fecha no está tildado", () => {
    expect(
      estaTildado({ estrategia: "intradia", activo: false, operar_hoy_fecha: null }, NOCHE_AR),
    ).toBe(false);
  });
});
