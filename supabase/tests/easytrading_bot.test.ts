import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { baseConMigraciones, codigoDeError, comoRol } from "./base";

// Migración 5: el rol easytrading_bot (EasyTrading conectado directo a
// Postgres). Solo puede ejecutar las 4 funciones de entrada, que usan la
// hora del servidor. Acá se prueba exactamente lo que puede y lo que no,
// y el ciclo completo llamando como ese rol.

let db: PGlite;

const bot = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  comoRol<{ r: T }>(db, "easytrading_bot", sql, params).then((f) => f[0].r);

const pendientes = () =>
  bot<{ envio_activado: boolean; senales: Record<string, unknown>[] }>("select public.easytrading_pendientes() as r");
const tomar = (id: unknown) => bot("select public.easytrading_tomar($1) as r", [id]);
const resultado = (
  id: unknown,
  estado: unknown,
  precio: unknown = null,
  nominales: unknown = null,
  modo: unknown = null,
  motivo: unknown = null,
) => bot("select public.easytrading_resultado($1, $2, $3, $4, $5, $6) as r", [id, estado, precio, nominales, modo, motivo]);
const posicionCerrada = (ticker: unknown, estrategia: unknown, cerradaEn: unknown, senalId: unknown = null) =>
  bot("select public.easytrading_posicion_cerrada($1, $2, $3, $4) as r", [ticker, estrategia, cerradaEn, senalId]);

/** Señal pendiente creada ahora (sin pasar por el filtro, que depende del día y la hora). */
async function senalNueva(ticker = "AAPL", accion = "compra"): Promise<number> {
  const [{ id }] = await comoRol<{ id: number }>(
    db,
    "postgres",
    `with a as (
       insert into public.alertas (origen, payload, ticker, estrategia, accion, precio_usd, estado)
       values ('tradingview', '{}', $1, 'corto', $2, 185.5, 'senal') returning id
     )
     insert into public.senales (alerta_id, origen, ticker_usa, ticker_byma, estrategia, accion, precio_usd, creada_en, vence_en)
     select id, 'tradingview', $1, $1, 'corto', $2, 185.5, now(), now() + interval '60 seconds' from a
     returning id`,
    [ticker, accion],
  );
  return id;
}

async function estadoSenal(id: number) {
  const [s] = await comoRol<Record<string, unknown>>(db, "postgres", "select * from public.senales where id = $1", [id]);
  return s;
}

beforeAll(async () => {
  db = await baseConMigraciones();
}, 60_000);

beforeEach(async () => {
  // Base de prueba en memoria: se vacía entre tests.
  await db.exec(`
    truncate public.avisos_easytrading, public.senales, public.alertas, public.activos,
             public.tickers restart identity cascade;
    update public.configuracion set envio_activado = true, easytrading_visto_en = null;
    insert into public.tickers (ticker_usa, ticker_byma) values ('AAPL', 'AAPL'), ('KO', 'KO');
    insert into public.activos (ticker_usa, estrategia, activo) values ('AAPL', 'corto', true);
  `);
});

describe("easytrading_bot: lo que PUEDE hacer", () => {
  it("es NOLOGIN y sin contraseña (el login lo habilita Fran a mano)", async () => {
    const [r] = await comoRol<{ rolcanlogin: boolean; rolpassword: string | null; rolconnlimit: number; rolsuper: boolean; rolbypassrls: boolean }>(
      db, "postgres",
      "select rolcanlogin, rolpassword, rolconnlimit, rolsuper, rolbypassrls from pg_authid where rolname = 'easytrading_bot'");
    expect(r).toEqual({ rolcanlogin: false, rolpassword: null, rolconnlimit: 3, rolsuper: false, rolbypassrls: false });
  });

  it("ejecuta exactamente 4 funciones fuera de pg_catalog: las de entrada", async () => {
    const filas = await comoRol<{ f: string }>(
      db, "postgres",
      `select p.oid::regprocedure::text as f
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname not in ('pg_catalog', 'information_schema')
         and has_schema_privilege('easytrading_bot', n.oid, 'USAGE')
         and has_function_privilege('easytrading_bot', p.oid, 'EXECUTE')
       order by 1`);
    expect(filas.map((f) => f.f)).toEqual([
      "easytrading_pendientes()",
      "easytrading_posicion_cerrada(text,text,timestamp with time zone,bigint)",
      "easytrading_resultado(bigint,text,numeric,integer,text,text)",
      "easytrading_tomar(bigint)",
    ]);
  });

  it("las 4 son SECURITY DEFINER con search_path vacío", async () => {
    const filas = await comoRol<{ proname: string; prosecdef: boolean; proconfig: string[] }>(
      db, "postgres",
      `select proname, prosecdef, proconfig from pg_proc
       where pronamespace = 'public'::regnamespace and proname like 'easytrading\\_%' order by 1`);
    expect(filas).toHaveLength(4);
    for (const f of filas) {
      expect(f.prosecdef).toBe(true);
      expect(f.proconfig).toEqual(['search_path=""']);
    }
  });

  it("ciclo completo con la hora del servidor: listar → tomar → resultado", async () => {
    const id = await senalNueva();
    const lista = await pendientes();
    expect(lista).toMatchObject({ envio_activado: true, senales: [expect.objectContaining({ id, ticker_byma: "AAPL" })] });

    expect(await tomar(id)).toMatchObject({ resultado: "tomada", senal: { id, estado: "tomada" } });
    expect(await tomar(id)).toEqual({ resultado: "no_disponible", estado: "tomada" });

    expect(await resultado(id, "ejecutada", 15230.5, 10, "PAPER")).toEqual({ resultado: "registrado", estado: "ejecutada" });
    expect(await resultado(id, "ejecutada", 15230.5, 10, "PAPER")).toEqual({ resultado: "ya_registrado", estado: "ejecutada" });
    expect(await estadoSenal(id)).toMatchObject({ estado: "ejecutada", resultado_nominales: 10, resultado_modo: "PAPER" });
  });

  it("descartada: el motivo se guarda recortado", async () => {
    const id = await senalNueva();
    await tomar(id);
    expect(await resultado(id, "descartada", null, null, null, "  sin posición abierta ")).toMatchObject({ resultado: "registrado" });
    expect((await estadoSenal(id)).resultado_motivo).toBe("sin posición abierta");
  });

  it("anota la última consulta (para el panel)", async () => {
    await pendientes();
    const [c] = await comoRol<{ visto: boolean }>(
      db, "postgres", "select easytrading_visto_en > now() - interval '1 minute' as visto from public.configuracion");
    expect(c.visto).toBe(true);
  });

  it("señal vencida (vence_en en el pasado): no se lista ni se puede tomar", async () => {
    const id = await senalNueva();
    await db.exec(`update public.senales set creada_en = now() - interval '2 minutes', vence_en = now() - interval '1 minute' where id = ${id}`);
    expect((await pendientes()).senales).toEqual([]);
    expect(await tomar(id)).toEqual({ resultado: "no_disponible", estado: "vencida" });
  });

  it("en pausa: lista vacía y tomar → pausado", async () => {
    const id = await senalNueva();
    await db.exec("update public.configuracion set envio_activado = false");
    expect(await pendientes()).toEqual({ envio_activado: false, senales: [] });
    expect(await tomar(id)).toEqual({ resultado: "pausado", estado: "pendiente" });
  });

  it("posición de corto cerrada: destilda y es idempotente; el ticker se pasa a mayúsculas", async () => {
    const cierre = new Date(Date.now() - 60_000).toISOString();
    expect(await posicionCerrada(" aapl ", "corto", cierre, 3)).toEqual({ resultado: "destildado", repetido: false });
    expect(await posicionCerrada("AAPL", "corto", cierre, 3)).toEqual({ resultado: "destildado", repetido: true });
    const [a] = await comoRol<{ activo: boolean }>(db, "postgres", "select activo from public.activos where ticker_usa = 'AAPL'");
    expect(a.activo).toBe(false);
  });
});

describe("easytrading_bot: validaciones de las funciones de entrada", () => {
  it.each([
    ["id nulo", null],
    ["id cero", 0],
    ["id negativo", -5],
  ])("tomar con %s → datos_invalidos", async (_caso, id) => {
    expect(await tomar(id)).toMatchObject({ resultado: "datos_invalidos" });
  });

  it("tomar una señal que no existe → no_existe", async () => {
    expect(await tomar(999)).toEqual({ resultado: "no_existe" });
  });

  it.each([
    ["estado desconocido", [1, "parcial"]],
    ["estado nulo", [1, null]],
    ["ejecutada sin precio", [1, "ejecutada", null, 1, "PAPER"]],
    ["ejecutada con precio 0", [1, "ejecutada", 0, 1, "PAPER"]],
    ["ejecutada sin nominales", [1, "ejecutada", 10, null, "PAPER"]],
    ["ejecutada con nominales 0", [1, "ejecutada", 10, 0, "PAPER"]],
    ["ejecutada con modo en minúscula", [1, "ejecutada", 10, 1, "paper"]],
    ["ejecutada con motivo", [1, "ejecutada", 10, 1, "PAPER", "x"]],
    ["descartada sin motivo", [1, "descartada", null, null, null, "   "]],
    ["descartada con motivo larguísimo", [1, "descartada", null, null, null, "x".repeat(501)]],
    ["descartada con nominales", [1, "descartada", null, 3, null, "x"]],
    ["id nulo", [null, "descartada", null, null, null, "x"]],
  ])("resultado inválido (%s) → datos_invalidos, sin tocar nada", async (_caso, args) => {
    const id = await senalNueva();
    await tomar(id);
    const [i, estado, precio, nominales, modo, motivo] = args as unknown[];
    expect(await resultado(i === 1 ? id : i, estado, precio, nominales, modo, motivo)).toMatchObject({
      resultado: "datos_invalidos",
      detalle: expect.any(String),
    });
    expect((await estadoSenal(id)).estado).toBe("tomada");
  });

  it.each([
    ["ticker con sufijo", ["AAPL.BA", "corto", new Date().toISOString()]],
    ["ticker vacío", ["", "corto", new Date().toISOString()]],
    ["intradía", ["AAPL", "intradia", new Date().toISOString()]],
    ["estrategia nula", ["AAPL", null, new Date().toISOString()]],
    ["sin hora de cierre", ["AAPL", "corto", null]],
    ["cierre en el futuro", ["AAPL", "corto", new Date(Date.now() + 3_600_000).toISOString()]],
    ["senal_id negativo", ["AAPL", "corto", new Date().toISOString(), -1]],
  ])("posición cerrada inválida (%s) → datos_invalidos, no destilda ni registra", async (_caso, args) => {
    expect(await posicionCerrada(...(args as [unknown, unknown, unknown, unknown?]))).toMatchObject({
      resultado: "datos_invalidos",
    });
    const [a] = await comoRol<{ activo: boolean }>(db, "postgres", "select activo from public.activos where ticker_usa = 'AAPL'");
    expect(a.activo).toBe(true);
    const [{ n }] = await comoRol<{ n: number }>(db, "postgres", "select count(*)::int n from public.avisos_easytrading");
    expect(n).toBe(0);
  });
});

describe("easytrading_bot: lo que NO puede hacer", () => {
  const TABLAS = [
    "alertas", "senales", "configuracion", "feriados", "activos", "tickers",
    "avisos_easytrading", "intentos_rechazados",
  ];

  it.each(TABLAS)("no lee ni escribe la tabla %s", async (tabla) => {
    expect(await codigoDeError(comoRol(db, "easytrading_bot", `select * from public.${tabla} limit 1`))).toBe("42501");
    expect(await codigoDeError(comoRol(db, "easytrading_bot", `delete from public.${tabla}`))).toBe("42501");
  });

  it("no tiene ningún permiso sobre tablas, vistas ni secuencias de ningún esquema de la app", async () => {
    const filas = await comoRol<{ c: string }>(
      db, "postgres",
      `select c.oid::regclass::text as c
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg\\_%'
         and c.relkind in ('r', 'v', 'm', 'p', 'f', 'S')
         and (has_table_privilege('easytrading_bot', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
              or (c.relkind = 'S' and has_sequence_privilege('easytrading_bot', c.oid, 'USAGE, SELECT, UPDATE')))`);
    expect(filas).toEqual([]);
  });

  it("no puede llamar registrar_alerta (no puede inventar alertas)", async () => {
    expect(
      await codigoDeError(
        comoRol(db, "easytrading_bot", "select public.registrar_alerta('tradingview', '{}', 'AAPL', 'corto', 'compra', 1, null, null)"),
      ),
    ).toBe("42501");
  });

  it.each([
    "select public.easytrading_pendientes(now())",
    "select public.easytrading_tomar(1, now())",
    "select public.easytrading_resultado(1, 'descartada', null, null, null, 'x', now())",
    "select public.easytrading_posicion_cerrada('AAPL', 'corto', now(), null, now())",
  ])("no puede pasar p_ahora: %s → la función no existe", async (sql) => {
    expect(await codigoDeError(comoRol(db, "easytrading_bot", sql))).toBe("42883");
  });

  it.each([
    "select public.easytrading_pendientes(p_ahora => now())",
    "select public.easytrading_tomar(p_id => 1, p_ahora => now())",
  ])("ni por nombre: %s", async (sql) => {
    expect(await codigoDeError(comoRol(db, "easytrading_bot", sql))).toBe("42883");
  });

  it.each([
    "select interno.pendientes(now())",
    "select interno.tomar(1, now())",
    "select interno.resultado(1, 'descartada', null, null, null, 'x', now())",
    "select interno.posicion_cerrada('AAPL', now(), null, now())",
  ])("no puede ejecutar las versiones internas: %s", async (sql) => {
    expect(await codigoDeError(comoRol(db, "easytrading_bot", sql))).toBe("42501");
  });

  it("no puede llamar las funciones auxiliares", async () => {
    expect(
      await codigoDeError(comoRol(db, "easytrading_bot", "select public.senal_para_easytrading(null::public.senales)")),
    ).toBe("42501");
  });

  it("no puede crear tablas en public", async () => {
    expect(await codigoDeError(comoRol(db, "easytrading_bot", "create table public.x (id int)"))).toBe("42501");
  });

  // (SET ROLE se controla contra el usuario de la sesión, que en este test
  //  es postgres: se verifica que el rol no pertenezca a ningún otro.)
  it("no es miembro de ningún rol: no puede volverse otro rol ni heredar permisos", async () => {
    const [{ n }] = await comoRol<{ n: number }>(
      db, "postgres",
      "select count(*)::int n from pg_auth_members where member = 'easytrading_bot'::regrole");
    expect(n).toBe(0);
  });

  it("anon, authenticated y service_role no pueden usar las funciones de entrada", async () => {
    for (const rol of ["anon", "authenticated", "service_role"] as const) {
      expect(await codigoDeError(comoRol(db, rol, "select public.easytrading_pendientes()"))).toBe("42501");
    }
  });
});
