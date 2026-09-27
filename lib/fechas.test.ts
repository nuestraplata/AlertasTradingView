import { describe, expect, it } from "vitest";
import { formatearMomentoAR, hoyAR } from "./fechas";

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

describe("formatearMomentoAR", () => {
  const AHORA = new Date("2026-09-27T18:00:00Z"); // 27/09 15:00 en Argentina

  it("hoy → solo la hora de Argentina (24 h)", () => {
    expect(formatearMomentoAR("2026-09-27T17:03:05Z", AHORA)).toBe("14:03:05");
    expect(formatearMomentoAR("2026-09-27T03:00:00Z", AHORA)).toBe("00:00:00");
  });

  it("otro día del mismo año → dd/mm hora", () => {
    expect(formatearMomentoAR("2026-09-26T17:03:05+00:00", AHORA)).toBe("26/09 14:03:05");
  });

  it("23:59 de Argentina de ayer aunque en UTC ya sea hoy", () => {
    expect(formatearMomentoAR("2026-09-27T02:59:00Z", AHORA)).toBe("26/09 23:59:00");
  });

  it("otro año → dd/mm/aaaa hora", () => {
    expect(formatearMomentoAR("2025-12-31T12:00:00Z", AHORA)).toBe("31/12/2025 09:00:00");
  });
});
