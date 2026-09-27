import { describe, expect, it } from "vitest";
import * as z from "zod";
import { checkbox, erroresPorCampo, textoANumero, textoONull } from "./validacion";

describe("textoONull", () => {
  it("recorta y convierte vacío en null", () => {
    expect(textoONull("  hola ")).toBe("hola");
    expect(textoONull("   ")).toBeNull();
    expect(textoONull("")).toBeNull();
    expect(textoONull(undefined)).toBeNull();
    expect(textoONull(null)).toBeNull();
  });
});

describe("textoANumero", () => {
  it("acepta punto o coma decimal", () => {
    expect(textoANumero("185.5", 6)).toBe(185.5);
    expect(textoANumero("185,5", 6)).toBe(185.5);
    expect(textoANumero(" 12 ", 6)).toBe(12);
    expect(textoANumero("0.000001", 6)).toBe(0.000001);
  });

  it("vacío → null; número ya numérico pasa igual", () => {
    expect(textoANumero("", 6)).toBeNull();
    expect(textoANumero(undefined, 6)).toBeNull();
    expect(textoANumero(7, 0)).toBe(7);
  });

  it.each(["1.234,5", "1,234.5", "1.2.3", "12a", "-5", "1e3", "0.0000001", ".5", "5."])(
    "rechaza %s (NaN)",
    (s) => expect(textoANumero(s, 6)).toBeNaN(),
  );

  it("sin decimales cuando decimales = 0", () => {
    expect(textoANumero("10", 0)).toBe(10);
    expect(textoANumero("10.5", 0)).toBeNaN();
    expect(textoANumero("10,0", 0)).toBeNaN();
  });
});

describe("checkbox", () => {
  it("interpreta los valores de un checkbox HTML", () => {
    expect(checkbox("on")).toBe(true);
    expect(checkbox("true")).toBe(true);
    expect(checkbox(true)).toBe(true);
    expect(checkbox(undefined)).toBe(false);
    expect(checkbox(null)).toBe(false);
    expect(checkbox("off")).toBe(false);
  });
});

describe("erroresPorCampo", () => {
  it("se queda con el primer mensaje de cada campo", () => {
    const r = z
      .object({ a: z.string().min(3, "corto").regex(/x/, "sin x"), b: z.number() })
      .safeParse({ a: "y", b: "no" });
    expect(r.success).toBe(false);
    const errores = erroresPorCampo(r.error!);
    expect(errores.a).toBe("corto");
    expect(Object.keys(errores).sort()).toEqual(["a", "b"]);
  });
});
