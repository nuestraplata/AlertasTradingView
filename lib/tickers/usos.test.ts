import { describe, expect, it } from "vitest";
import { nombresListas, usosPorTicker } from "./usos";

describe("usosPorTicker", () => {
  it("agrupa por ticker en orden fijo corto → intradía", () => {
    expect(
      usosPorTicker([
        { ticker_usa: "AAPL", estrategia: "intradia" },
        { ticker_usa: "MELI", estrategia: "intradia" },
        { ticker_usa: "AAPL", estrategia: "corto" },
      ]),
    ).toEqual({ AAPL: ["corto", "intradia"], MELI: ["intradia"] });
  });

  it("sin activos → vacío", () => {
    expect(usosPorTicker([])).toEqual({});
  });
});

describe("nombresListas", () => {
  it("arma el texto para mensajes", () => {
    expect(nombresListas([])).toBe("");
    expect(nombresListas(["corto"])).toBe("Corto plazo");
    expect(nombresListas(["corto", "intradia"])).toBe("Corto plazo e Intradía");
  });
});
