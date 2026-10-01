import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Postgres de verdad (PGlite, en memoria) con las migraciones del repo y
// roles parecidos a los de Supabase. Sirve para probar reglas, GRANT y
// RLS: un cliente de Supabase falso no detecta un permiso que falta.

const CARPETA = join(process.cwd(), "supabase", "migrations");

export type Rol = "postgres" | "anon" | "authenticated" | "service_role";

export async function baseConMigraciones(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    set timezone = 'UTC'; -- como Supabase
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
  `);
  for (const archivo of readdirSync(CARPETA).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(CARPETA, archivo), "utf8"));
  }
  return db;
}

/** Corre una consulta con el rol dado y vuelve a postgres. */
export async function comoRol<T = Record<string, unknown>>(
  db: PGlite,
  rol: Rol,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.exec(`set role ${rol}`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}

/** Código de error de Postgres de una consulta que tiene que fallar. */
export async function codigoDeError(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "sin código";
  }
}

/**
 * Imita supabase.rpc(funcion, args) de un cliente con la clave secreta:
 * llama a la función con argumentos POR NOMBRE (como PostgREST), así un
 * parámetro mal escrito falla igual que en Supabase.
 * reloj: la hora que ven las funciones (p_ahora), para que el test no
 * dependa de si hoy es día hábil. El servidor nunca manda p_ahora.
 */
export function rpcComoServidor(db: PGlite, reloj: () => string) {
  return async (funcion: string, argumentos: Record<string, unknown> = {}) => {
    if ("p_ahora" in argumentos) throw new Error("el servidor no debe mandar p_ahora");
    const args = { ...argumentos, p_ahora: reloj() };
    const nombres = Object.keys(args);
    if (!/^[a-z_]+$/.test(funcion) || nombres.some((n) => !/^[a-z_]+$/.test(n))) {
      throw new Error("nombre inválido");
    }
    const lista = nombres.map((n, i) => `${n} => $${i + 1}`).join(", ");
    const valores = nombres.map((n) => {
      const v = args[n as keyof typeof args];
      return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    });
    try {
      const [fila] = await comoRol<{ r: unknown }>(db, "service_role", `select public.${funcion}(${lista}) as r`, valores);
      return { data: fila.r, error: null };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      return { data: null, error: { code: err.code ?? "", message: err.message ?? "" } };
    }
  };
}
