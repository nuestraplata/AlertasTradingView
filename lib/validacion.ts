import * as z from "zod";

/** "" o solo espacios → null; el resto, recortado. */
export function textoONull(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return v;
  const s = v.trim();
  return s === "" ? null : s;
}

/**
 * Texto de un input → número. Acepta punto o coma como separador decimal
 * (185.5 o 185,5), sin separador de miles, hasta `decimales` decimales.
 * Vacío → null. Cualquier otra cosa → NaN (lo rechaza el esquema).
 */
export function textoANumero(v: unknown, decimales: number): unknown {
  if (typeof v === "number") return v;
  const s = textoONull(v);
  if (s === null || typeof s !== "string") return s;
  const patron =
    decimales > 0
      ? new RegExp(`^\\d{1,12}(?:[.,]\\d{1,${decimales}})?$`)
      : /^\d{1,12}$/;
  return patron.test(s) ? Number(s.replace(",", ".")) : NaN;
}

/** Checkbox de un formulario: "on" / "true" / true → true; ausente → false. */
export function checkbox(v: unknown): boolean {
  return v === true || v === "on" || v === "true";
}

/** Primer mensaje de error por campo, para mostrar debajo de cada input. */
export function erroresPorCampo(error: z.ZodError): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = issue.path.length ? String(issue.path[0]) : "_form";
    salida[campo] ??= issue.message;
  }
  return salida;
}
