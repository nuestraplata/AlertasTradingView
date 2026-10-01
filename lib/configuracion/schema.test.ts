import { describe, expect, it } from "vitest";
import { feriadoSchema, horaCorta, horarioSchema } from "./schema";

describe("horarioSchema", () => {
  it("acepta HH:MM y HH:MM:SS, y guarda HH:MM", () => {
    expect(horarioSchema.parse({ hora_apertura: "11:00", hora_cierre: "17:00:00" })).toEqual({
      hora_apertura: "11:00",
      hora_cierre: "17:00",
    });
  });

  it.each([
    ["cierre antes de la apertura", { hora_apertura: "17:00", hora_cierre: "11:00" }, "hora_cierre"],
    ["iguales", { hora_apertura: "11:00", hora_cierre: "11:00" }, "hora_cierre"],
    ["hora imposible", { hora_apertura: "25:00", hora_cierre: "17:00" }, "hora_apertura"],
    ["vacía", { hora_apertura: "", hora_cierre: "17:00" }, "hora_apertura"],
  ])("rechaza: %s", (_caso, datos, campo) => {
    const r = horarioSchema.safeParse(datos);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path[0]).toBe(campo);
  });
});

describe("feriadoSchema", () => {
  it("fecha válida y descripción recortada", () => {
    expect(feriadoSchema.parse({ fecha: "2026-12-25", descripcion: "  Navidad " })).toEqual({
      fecha: "2026-12-25",
      descripcion: "Navidad",
    });
  });

  it.each([
    ["fecha que no existe", { fecha: "2026-02-30", descripcion: "x" }],
    ["formato raro", { fecha: "25/12/2026", descripcion: "x" }],
    ["sin descripción", { fecha: "2026-12-25", descripcion: "   " }],
    ["descripción larga", { fecha: "2026-12-25", descripcion: "x".repeat(101) }],
  ])("rechaza: %s", (_caso, datos) => {
    expect(feriadoSchema.safeParse(datos).success).toBe(false);
  });
});

describe("horaCorta", () => {
  it("11:00:00 → 11:00", () => expect(horaCorta("11:00:00")).toBe("11:00"));
});
