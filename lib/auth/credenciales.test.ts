import { describe, expect, it } from "vitest";
import { leerCredenciales } from "./credenciales";

describe("leerCredenciales", () => {
  it("normaliza el email y no toca la contraseña", () => {
    expect(leerCredenciales("  Fran@Mail.COM ", " clave con espacios ")).toEqual({
      ok: true,
      datos: { email: "fran@mail.com", password: " clave con espacios " },
    });
  });

  it("exige ambos campos", () => {
    expect(leerCredenciales("", "x")).toEqual({
      ok: false,
      error: "Completá email y contraseña.",
    });
    expect(leerCredenciales("a@b.co", "")).toMatchObject({ ok: false });
    expect(leerCredenciales(null, null)).toMatchObject({ ok: false });
  });

  it("rechaza emails mal formados", () => {
    expect(leerCredenciales("sin-arroba", "x")).toMatchObject({
      ok: false,
      error: "El email no tiene un formato válido.",
    });
  });
});
