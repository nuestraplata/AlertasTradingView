import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Postgres de verdad (PGlite, en memoria) con las migraciones del repo y
// roles parecidos a los de Supabase. Sirve para probar reglas, GRANT y
// RLS: un cliente de Supabase falso no detecta un permiso que falta.

const CARPETA = join(process.cwd(), "supabase", "migrations");

export type Rol = "postgres" | "anon" | "authenticated" | "service_role" | "easytrading_bot";

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

