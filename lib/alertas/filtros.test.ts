import { describe, expect, it } from "vitest";
import { hayFiltros, leerFiltros, urlAlertas } from "./filtros";

const VACIO = { estrategia: null, accion: null, estado: null, origen: null, limite: 100 };

describe("leerFiltros", () => {
  it("sin parámetros → sin filtros, 100 alertas", () => {
    expect(leerFiltros({})).toEqual(VACIO);
  });

  it("lee los filtros válidos", () => {
    expect(
      leerFiltros({ estrategia: "corto", accion: "venta", estado: "descartada", origen: "simulada", limite: "200" }),
    ).toEqual({ estrategia: "corto", accion: "venta", estado: "descartada", origen: "simulada", limite: 200 });
  });

  it("ignora valores inválidos o manipulados", () => {
    expect(leerFiltros({ estrategia: "swing", accion: "sl", estado: "x", origen: "otro", limite: "abc" })).toEqual(VACIO);
  });

  it("límite: múltiplo de 100, máximo 1000", () => {
    expect(leerFiltros({ limite: "150" }).limite).toBe(200);
    expect(leerFiltros({ limite: "99999" }).limite).toBe(1000);
    expect(leerFiltros({ limite: "-5" }).limite).toBe(100);
    expect(leerFiltros({ limite: "0" }).limite).toBe(100);
  });

  it("si un parámetro viene repetido, usa el primero", () => {
    expect(leerFiltros({ estrategia: ["intradia", "corto"] }).estrategia).toBe("intradia");
  });
});

describe("urlAlertas", () => {
  it("sin filtros → /alertas", () => {
    expect(urlAlertas(VACIO, {})).toBe("/alertas");
  });

  it("agrega, cambia y quita filtros", () => {
    const f = { ...VACIO, estrategia: "corto" as const };
    expect(urlAlertas(f, { accion: "compra" })).toBe("/alertas?estrategia=corto&accion=compra");
    expect(urlAlertas(f, { estrategia: "intradia" })).toBe("/alertas?estrategia=intradia");
    expect(urlAlertas(f, { estrategia: null })).toBe("/alertas");
  });

  it("cambiar un filtro vuelve a 100; 'ver más' conserva los filtros", () => {
    const f = { ...VACIO, estado: "descartada" as const, limite: 300 };
    expect(urlAlertas(f, { accion: "venta" })).toBe("/alertas?accion=venta&estado=descartada");
    expect(urlAlertas(f, { limite: 400 })).toBe("/alertas?estado=descartada&limite=400");
  });
});

describe("hayFiltros", () => {
  it("el límite no cuenta como filtro", () => {
    expect(hayFiltros({ ...VACIO, limite: 500 })).toBe(false);
    expect(hayFiltros({ ...VACIO, origen: "simulada" })).toBe(true);
  });
});
