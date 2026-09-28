import { describe, expect, it } from "vitest";
import { destinoSeguro, esRutaPublica } from "./rutas";

describe("esRutaPublica", () => {
  it.each(["/login", "/api/webhook", "/api/webhook/x", "/api/easytrading/ordenes", "/api/cron/keepalive"])(
    "%s es pública",
    (ruta) => expect(esRutaPublica(ruta)).toBe(true),
  );

  it.each(["/", "/corto", "/intradia", "/alertas", "/loginx", "/api/webhookx", "/api/otra", "/api/cronx", "/login-falso"])(
    "%s exige sesión",
    (ruta) => expect(esRutaPublica(ruta)).toBe(false),
  );
});

describe("destinoSeguro", () => {
  it("acepta rutas internas, con query", () => {
    expect(destinoSeguro("/corto")).toBe("/corto");
    expect(destinoSeguro("/intradia?x=1")).toBe("/intradia?x=1");
  });

  it("vuelve al inicio si no hay destino", () => {
    expect(destinoSeguro(undefined)).toBe("/");
    expect(destinoSeguro(null)).toBe("/");
    expect(destinoSeguro("")).toBe("/");
  });

  it.each([
    "https://malo.com",
    "//malo.com",
    "/\\malo.com",
    "/\tmalo",
    "javascript:alert(1)",
    "corto",
  ])("rechaza %s (redirección abierta)", (next) => {
    expect(destinoSeguro(next)).toBe("/");
  });

  it("no manda de vuelta al login ni a rutas públicas", () => {
    expect(destinoSeguro("/login")).toBe("/");
    expect(destinoSeguro("/api/webhook")).toBe("/");
  });
});
