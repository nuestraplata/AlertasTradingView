export type Credenciales = { email: string; password: string };

export type ResultadoCredenciales =
  | { ok: true; datos: Credenciales }
  | { ok: false; error: string };

/** Valida lo que llega del formulario de login antes de llamar a Supabase. */
export function leerCredenciales(
  email: unknown,
  password: unknown,
): ResultadoCredenciales {
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  const p = typeof password === "string" ? password : "";

  if (!e || !p) {
    return { ok: false, error: "Completá email y contraseña." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return { ok: false, error: "El email no tiene un formato válido." };
  }
  return { ok: true, datos: { email: e, password: p } };
}
