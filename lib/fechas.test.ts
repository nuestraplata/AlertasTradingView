import { describe, expect, it } from "vitest";
import { hoyAR } from "./fechas";

describe("hoyAR", () => {
  it("devuelve YYYY-MM-DD en hora de Argentina (UTC-3)", () => {
    expect(hoyAR(new Date("2026-09-26T15:00:00Z"))).toBe("2026-09-26");
  });

  it("a las 23:59 de Argentina sigue siendo el mismo día aunque en UTC ya sea mañana", () => {
    expect(hoyAR(new Date("2026-09-27T02:59:59Z"))).toBe("2026-09-26");
  });

  it("cambia de día a las 00:00 de Argentina (03:00 UTC)", () => {
    expect(hoyAR(new Date("2026-09-27T03:00:00Z"))).toBe("2026-09-27");
  });

  it("cambio de año", () => {
    expect(hoyAR(new Date("2027-01-01T02:59:59Z"))).toBe("2026-12-31");
    expect(hoyAR(new Date("2027-01-01T03:00:00Z"))).toBe("2027-01-01");
  });

  it("rellena mes y día con cero", () => {
    expect(hoyAR(new Date("2026-03-05T12:00:00Z"))).toBe("2026-03-05");
  });

  it("sin argumento usa la hora actual y respeta el formato", () => {
    expect(hoyAR()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
