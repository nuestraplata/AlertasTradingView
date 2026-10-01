import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MOTIVO_SIMULADA_NO_ENVIADA } from "@/lib/alertas/registrar";
import { baseConMigraciones, codigoDeError, comoRol } from "./base";

// Migraciones 4 y 5 (F3) contra Postgres real: filtro de señales y la
// lógica de EasyTrading (versiones internas con p_ahora, para fijar la
// hora). registrar_alerta se llama como service_role, igual que el
// servidor; las internas, como su dueño (igual que las funciones de
// entrada). Los permisos de easytrading_bot están en easytrading_bot.test.ts.

let db: PGlite;

// Jueves 1/10/2026, 14:00 en Argentina (UTC−3).
const JUEVES_14 = "2026-10-01T17:00:00Z";
const mas = (iso: string, segundos: number) =>
  new Date(new Date(iso).getTime() + segundos * 1000).toISOString();

type Alerta = {
  origen?: string;
  ticker?: string | null;
  estrategia?: string | null;
  accion?: string | null;
  precio?: number | null;
  motivo?: string | null;
  enviarSimulada?: boolean;
  ahora?: string;
};
type Registro = { alerta_id: number; estado: string; motivo: string | null; senal_id: number | null };

async function rpc<T>(funcion: string, args: unknown[]): Promise<T> {
  const marcas = args.map((_, i) => `$${i + 1}`).join(", ");
  const rol = funcion.startsWith("interno.") ? "postgres" : "service_role";
  const nombre = funcion.includes(".") ? funcion : `public.${funcion}`;
  const [fila] = await comoRol<{ r: T }>(db, rol, `select ${nombre}(${marcas}) as r`, args);
  return fila.r;
}

function registrar(a: Alerta = {}): Promise<Registro> {
  return rpc<Registro>("registrar_alerta", [
    a.origen ?? "tradingview",
    JSON.stringify({ ticker: a.ticker ?? "AAPL" }),
    a.ticker === undefined ? "AAPL" : a.ticker,
    a.estrategia === undefined ? "corto" : a.estrategia,
    a.accion === undefined ? "compra" : a.accion,
    a.precio === undefined ? 185.5 : a.precio,
    null,
    a.motivo ?? null,
    a.enviarSimulada ?? false,
    a.ahora ?? JUEVES_14,
  ]);
}

const tomar = (id: number, ahora = JUEVES_14) =>
  rpc<Record<string, unknown>>("interno.tomar", [id, ahora]);
const pendientes = (ahora = JUEVES_14) =>
  rpc<{ envio_activado: boolean; senales: Record<string, unknown>[] }>("interno.pendientes", [ahora]);
const resultado = (
  id: number,
  r: { estado: string; precio?: number; nominales?: number; modo?: string; motivo?: string },
  ahora = mas(JUEVES_14, 5),
) =>
  rpc<Record<string, unknown>>("interno.resultado", [
    id, r.estado, r.precio ?? null, r.nominales ?? null, r.modo ?? null, r.motivo ?? null, ahora,
  ]);
const posicionCerrada = (ticker: string, cerradaEn: string, senalId: number | null = null) =>
  rpc<{ resultado: string; repetido: boolean }>("interno.posicion_cerrada", [ticker, cerradaEn, senalId, mas(cerradaEn, 1)]);

async function senal(id: number) {
  const [s] = await comoRol<Record<string, unknown>>(db, "postgres", "select * from public.senales where id = $1", [id]);
  return s;
}
async function activoCorto(ticker: string) {
  const [a] = await comoRol<{ activo: boolean }>(
    db, "postgres", "select activo from public.activos where ticker_usa = $1 and estrategia = 'corto'", [ticker]);
  return a?.activo;
}

beforeAll(async () => {
  db = await baseConMigraciones();
}, 60_000);

beforeEach(async () => {
  // Base de prueba en memoria: se vacía entre tests.
  await db.exec(`
    truncate public.avisos_easytrading, public.senales, public.alertas, public.feriados,
             public.activos, public.tickers restart identity cascade;
    update public.configuracion set envio_activado = true, hora_apertura = '11:00',
           hora_cierre = '17:00', easytrading_visto_en = null;
    insert into public.tickers (ticker_usa, ticker_byma) values
      ('AAPL', 'AAPL'), ('MELI', 'MELI'), ('KO', 'KO'), ('BRK.B', 'BRKB');
    insert into public.activos (ticker_usa, estrategia, activo, operar_hoy_fecha) values
      ('AAPL', 'corto', true, null),
      ('KO', 'corto', false, null),
      ('MELI', 'intradia', false, '2026-10-01'),
      ('AAPL', 'intradia', false, '2026-09-30');
  `);
});

describe("registrar_alerta: filtro de señales", () => {
  it("compra tildada, en horario y con envío activado → señal pendiente que vence a los 60 s", async () => {
    const r = await registrar({ ticker: "AAPL" });
    expect(r).toMatchObject({ estado: "senal", motivo: null });
    expect(r.senal_id).toEqual(expect.any(Number));
    const s = await senal(r.senal_id!);
    expect(s).toMatchObject({ alerta_id: r.alerta_id, ticker_byma: "AAPL", estado: "pendiente", accion: "compra" });
    expect((s.vence_en as Date).getTime() - (s.creada_en as Date).getTime()).toBe(60_000);
  });

  it("guarda el CEDEAR del mapeo (BRK.B → BRKB)", async () => {
    await db.exec("insert into public.activos (ticker_usa, estrategia, activo) values ('BRK.B', 'corto', true)");
    const r = await registrar({ ticker: "BRK.B" });
    expect((await senal(r.senal_id!)).ticker_byma).toBe("BRKB");
  });

  it("datos inválidos → descartada con el motivo del servidor, sin señal", async () => {
    const r = await registrar({ accion: null, motivo: '"accion" inválida: "sl".' });
    expect(r).toMatchObject({ estado: "descartada", motivo: '"accion" inválida: "sl".', senal_id: null });
  });

  it.each([
    ["sábado", "2026-10-03T17:00:00Z", "Fuera de horario: fin de semana."],
    ["domingo", "2026-10-04T17:00:00Z", "Fuera de horario: fin de semana."],
    ["antes de abrir (10:59:59)", "2026-10-01T13:59:59Z", "Fuera de horario: 10:59:59 (mercado de 11:00 a 17:00)."],
    ["al cierre (17:00:00)", "2026-10-01T20:00:00Z", "Fuera de horario: 17:00:00 (mercado de 11:00 a 17:00)."],
    // 22:00 en Argentina: en UTC ya es viernes, pero se mira la hora local.
    ["de noche", "2026-10-02T01:00:00Z", "Fuera de horario: 22:00:00 (mercado de 11:00 a 17:00)."],
  ])("fuera de horario: %s → descartada", async (_caso, ahora, motivo) => {
    expect(await registrar({ ahora })).toMatchObject({ estado: "descartada", motivo, senal_id: null });
  });

  it("límites del horario: 11:00:00 y 16:59:59 pasan", async () => {
    expect(await registrar({ ahora: "2026-10-01T14:00:00Z" })).toMatchObject({ estado: "senal" });
    expect(await registrar({ ahora: "2026-10-01T19:59:59Z", accion: "venta" })).toMatchObject({ estado: "senal" });
  });

  it("el horario es configurable", async () => {
    await db.exec("update public.configuracion set hora_apertura = '15:00'");
    expect(await registrar()).toMatchObject({
      estado: "descartada",
      motivo: "Fuera de horario: 14:00:00 (mercado de 15:00 a 17:00).",
    });
  });

  it("feriado → descartada con su descripción", async () => {
    await db.exec("insert into public.feriados values ('2026-10-01', 'Día de prueba')");
    expect(await registrar()).toMatchObject({ estado: "descartada", motivo: "Fuera de horario: feriado (Día de prueba)." });
  });

  it("duplicada: igual a otra de hace menos de 30 s → descartada; a los 30 s ya no", async () => {
    const primera = await registrar();
    expect(await registrar({ ahora: mas(JUEVES_14, 29) })).toMatchObject({
      estado: "descartada",
      motivo: `Duplicada: igual a la alerta #${primera.alerta_id} (menos de 30 s).`,
    });
    // La duplicada también cuenta: 30 s después de la PRIMERA sigue habiendo una de hace 1 s.
    expect(await registrar({ ahora: mas(JUEVES_14, 30) })).toMatchObject({ estado: "descartada" });
    expect(await registrar({ ahora: mas(JUEVES_14, 60) })).toMatchObject({ estado: "senal" });
  });

  it("no es duplicada si cambia el ticker, la estrategia o la acción", async () => {
    await registrar();
    expect(await registrar({ accion: "venta" })).toMatchObject({ estado: "senal" });
    expect(await registrar({ estrategia: "intradia", accion: "venta" })).toMatchObject({ estado: "senal" });
    expect(await registrar({ ticker: "MELI", estrategia: "intradia" })).toMatchObject({ estado: "senal" });
  });

  it("una simulada no bloquea a una real igual (migración 5)", async () => {
    await registrar({ origen: "simulada" });
    expect(await registrar({ ahora: mas(JUEVES_14, 5) })).toMatchObject({ estado: "senal" });
  });

  it("una real sí bloquea a una simulada igual, y una simulada a otra simulada", async () => {
    const real = await registrar();
    expect(await registrar({ origen: "simulada", enviarSimulada: true, ahora: mas(JUEVES_14, 5) })).toMatchObject({
      estado: "descartada",
      motivo: `Duplicada: igual a la alerta #${real.alerta_id} (menos de 30 s).`,
    });
    const otra = await registrar({ ticker: "KO", accion: "venta", origen: "simulada" });
    expect(await registrar({ ticker: "KO", accion: "venta", origen: "simulada", ahora: mas(JUEVES_14, 5) })).toMatchObject({
      motivo: `Duplicada: igual a la alerta #${otra.alerta_id} (menos de 30 s).`,
    });
  });

  it("una alerta con datos inválidos no cuenta para duplicadas", async () => {
    await registrar({ precio: null, motivo: '"precio" inválido.' });
    expect(await registrar()).toMatchObject({ estado: "senal" });
  });

  it("ticker que no está en la lista de esa estrategia → descartada", async () => {
    expect(await registrar({ ticker: "MELI", estrategia: "corto" })).toMatchObject({
      estado: "descartada",
      motivo: "No está en la lista de Corto plazo.",
    });
    expect(await registrar({ ticker: "KO", estrategia: "intradia", accion: "venta" })).toMatchObject({
      estado: "descartada",
      motivo: "No está en la lista de Intradía.",
    });
  });

  it("corto: compra sin tildar → descartada; venta sin tildar → señal", async () => {
    expect(await registrar({ ticker: "KO" })).toMatchObject({
      estado: "descartada",
      motivo: "Compra de un activo sin tildar en Corto plazo.",
    });
    expect(await registrar({ ticker: "KO", accion: "venta" })).toMatchObject({ estado: "senal" });
  });

  it("intradía: compra solo con 'operar hoy' de HOY (Argentina); la venta pasa igual", async () => {
    expect(await registrar({ ticker: "MELI", estrategia: "intradia" })).toMatchObject({ estado: "senal" });
    // AAPL intradía tiene "operar hoy" de ayer.
    expect(await registrar({ ticker: "AAPL", estrategia: "intradia" })).toMatchObject({
      estado: "descartada",
      motivo: 'Compra de un activo sin "operar hoy" en Intradía.',
    });
    expect(await registrar({ ticker: "AAPL", estrategia: "intradia", accion: "venta" })).toMatchObject({
      estado: "senal",
    });
  });

  it("pausado → descartada con motivo 'pausado', pero se guarda", async () => {
    await db.exec("update public.configuracion set envio_activado = false");
    expect(await registrar()).toMatchObject({ estado: "descartada", motivo: "pausado", senal_id: null });
    expect(await registrar({ ticker: "KO", accion: "venta" })).toMatchObject({ motivo: "pausado" });
  });

  it("orden de las reglas: fuera de horario gana sobre pausado y sobre 'no está en la lista'", async () => {
    await db.exec("update public.configuracion set envio_activado = false");
    expect(await registrar({ ticker: "MELI", ahora: "2026-10-03T17:00:00Z" })).toMatchObject({
      motivo: "Fuera de horario: fin de semana.",
    });
  });

  it("simulada: si no se pide enviar, pasa el filtro pero NO genera señal", async () => {
    expect(await registrar({ origen: "simulada" })).toMatchObject({
      estado: "descartada",
      motivo: MOTIVO_SIMULADA_NO_ENVIADA,
      senal_id: null,
    });
  });

  it("simulada con 'enviar' → señal marcada como simulada", async () => {
    const r = await registrar({ origen: "simulada", enviarSimulada: true });
    expect(r.estado).toBe("senal");
    expect((await senal(r.senal_id!)).origen).toBe("simulada");
  });

  it("una alerta genera como máximo una señal", async () => {
    const r = await registrar();
    const codigo = await codigoDeError(
      db.query(
        `insert into public.senales (alerta_id, origen, ticker_usa, ticker_byma, estrategia, accion, precio_usd, creada_en, vence_en)
         values ($1, 'tradingview', 'AAPL', 'AAPL', 'corto', 'compra', 1, now(), now() + interval '1 minute')`,
        [r.alerta_id],
      ),
    );
    expect(codigo).toBe("23505");
  });
});

describe("lógica de EasyTrading (versiones internas)", () => {
  it("pendientes: devuelve las vigentes y anota la última consulta", async () => {
    const r = await registrar();
    const p = await pendientes(mas(JUEVES_14, 10));
    expect(p.envio_activado).toBe(true);
    expect(p.senales).toEqual([
      expect.objectContaining({ id: r.senal_id, alerta_id: r.alerta_id, ticker_byma: "AAPL", accion: "compra", estado: "pendiente", origen: "tradingview" }),
    ]);
    const [c] = await comoRol<{ easytrading_visto_en: Date }>(db, "postgres", "select easytrading_visto_en from public.configuracion");
    expect(c.easytrading_visto_en.toISOString()).toBe(mas(JUEVES_14, 10));
  });

  it("pendientes: a los 60 s la señal queda vencida y no se devuelve más", async () => {
    const r = await registrar();
    expect((await pendientes(mas(JUEVES_14, 60))).senales).toEqual([]);
    expect((await senal(r.senal_id!)).estado).toBe("vencida");
  });

  it("pendientes: en pausa no devuelve nada", async () => {
    await registrar();
    await db.exec("update public.configuracion set envio_activado = false");
    expect(await pendientes()).toEqual({ envio_activado: false, senales: [] });
  });

  it("tomar: pendiente → tomada; la segunda vez falla", async () => {
    const r = await registrar();
    expect(await tomar(r.senal_id!, mas(JUEVES_14, 3))).toMatchObject({
      resultado: "tomada",
      senal: { id: r.senal_id, ticker_byma: "AAPL", estado: "tomada" },
    });
    expect(await tomar(r.senal_id!, mas(JUEVES_14, 4))).toEqual({ resultado: "no_disponible", estado: "tomada" });
    expect((await pendientes(mas(JUEVES_14, 5))).senales).toEqual([]);
  });

  it("tomar: vencida (60 s) → no_disponible y queda vencida", async () => {
    const r = await registrar();
    expect(await tomar(r.senal_id!, mas(JUEVES_14, 60))).toEqual({ resultado: "no_disponible", estado: "vencida" });
    expect((await senal(r.senal_id!)).estado).toBe("vencida");
  });

  it("tomar: en pausa → pausado (la señal no se entrega)", async () => {
    const r = await registrar();
    await db.exec("update public.configuracion set envio_activado = false");
    expect(await tomar(r.senal_id!)).toEqual({ resultado: "pausado", estado: "pendiente" });
    expect((await senal(r.senal_id!)).estado).toBe("pendiente");
  });

  it("tomar: id inexistente → no_existe", async () => {
    expect(await tomar(999)).toEqual({ resultado: "no_existe" });
  });

  it("resultado ejecutada: se guarda; repetirlo igual es idempotente; otro distinto no", async () => {
    const r = await registrar();
    await tomar(r.senal_id!);
    const ejecutada = { estado: "ejecutada", precio: 15230.5, nominales: 10, modo: "PAPER" };
    expect(await resultado(r.senal_id!, ejecutada)).toEqual({ resultado: "registrado", estado: "ejecutada" });
    expect(await senal(r.senal_id!)).toMatchObject({
      estado: "ejecutada", resultado_nominales: 10, resultado_modo: "PAPER", resultado_motivo: null,
    });
    expect(Number((await senal(r.senal_id!)).resultado_precio_ars)).toBe(15230.5);
    expect(await resultado(r.senal_id!, ejecutada)).toEqual({ resultado: "ya_registrado", estado: "ejecutada" });
    expect(await resultado(r.senal_id!, { ...ejecutada, nominales: 11 })).toEqual({
      resultado: "no_disponible", estado: "ejecutada",
    });
  });

  it("resultado descartada por EasyTrading: se guarda el motivo", async () => {
    const r = await registrar({ ticker: "KO", accion: "venta" });
    await tomar(r.senal_id!);
    expect(await resultado(r.senal_id!, { estado: "descartada", motivo: "sin posición abierta" })).toMatchObject({
      resultado: "registrado",
    });
    expect(await senal(r.senal_id!)).toMatchObject({ estado: "descartada", resultado_motivo: "sin posición abierta" });
  });

  it("resultado de una señal que no se tomó → no_disponible", async () => {
    const r = await registrar();
    expect(await resultado(r.senal_id!, { estado: "descartada", motivo: "x" })).toEqual({
      resultado: "no_disponible", estado: "pendiente",
    });
    expect(await resultado(999, { estado: "descartada", motivo: "x" })).toEqual({ resultado: "no_existe" });
  });

  it("resultado incoherente (ejecutada sin nominales) → la base lo rechaza", async () => {
    const r = await registrar();
    await tomar(r.senal_id!);
    expect(await codigoDeError(resultado(r.senal_id!, { estado: "ejecutada", precio: 1, modo: "PAPER" }))).toBe("23514");
  });

  it("posición de corto cerrada: destilda 'activo' y registra el aviso", async () => {
    expect(await posicionCerrada("AAPL", JUEVES_14, 1)).toEqual({ resultado: "destildado", repetido: false });
    expect(await activoCorto("AAPL")).toBe(false);
    // Intradía no se toca.
    const [intra] = await comoRol<{ operar_hoy_fecha: string }>(
      db, "postgres", "select operar_hoy_fecha::text from public.activos where ticker_usa = 'MELI'");
    expect(intra.operar_hoy_fecha).toBe("2026-10-01");
  });

  it("posición cerrada repetida (mismo cierre) → no vuelve a destildar aunque se haya tildado de nuevo", async () => {
    await posicionCerrada("AAPL", JUEVES_14);
    await db.exec("update public.activos set activo = true where ticker_usa = 'AAPL' and estrategia = 'corto'");
    expect(await posicionCerrada("AAPL", JUEVES_14)).toEqual({ resultado: "destildado", repetido: true });
    expect(await activoCorto("AAPL")).toBe(true);
  });

  it("posición cerrada: ya destildado / no está en la lista / ticker desconocido → OK y registrado", async () => {
    expect(await posicionCerrada("KO", JUEVES_14)).toMatchObject({ resultado: "ya_destildado" });
    expect(await posicionCerrada("MELI", JUEVES_14)).toMatchObject({ resultado: "no_esta_en_la_lista" });
    expect(await posicionCerrada("ZZZ", JUEVES_14)).toMatchObject({ resultado: "ticker_desconocido" });
    const [{ n }] = await comoRol<{ n: number }>(db, "postgres", "select count(*)::int n from public.avisos_easytrading");
    expect(n).toBe(3);
  });
});

describe("permisos", () => {
  const ENTRADA = [
    "select public.easytrading_pendientes()",
    "select public.easytrading_tomar(1)",
    "select public.easytrading_resultado(1, 'descartada', null, null, null, 'x')",
    "select public.easytrading_posicion_cerrada('AAPL', 'corto', now(), null)",
  ];
  const INTERNAS = [
    "select interno.pendientes(now())",
    "select interno.tomar(1, now())",
    "select interno.resultado(1, 'descartada', null, null, null, 'x', now())",
    "select interno.posicion_cerrada('AAPL', now(), null, now())",
  ];
  const REGISTRAR = "select public.registrar_alerta('tradingview', '{}', null, null, null, null, null, 'x')";

  it.each([...ENTRADA, ...INTERNAS])("anon, authenticated y service_role no pueden llamar %s", async (sql) => {
    for (const rol of ["anon", "authenticated", "service_role"] as const) {
      expect(await codigoDeError(comoRol(db, rol, sql))).toBe("42501");
    }
  });

  it("registrar_alerta: solo service_role (el webhook)", async () => {
    await comoRol(db, "service_role", REGISTRAR);
    expect(await codigoDeError(comoRol(db, "anon", REGISTRAR))).toBe("42501");
    expect(await codigoDeError(comoRol(db, "authenticated", REGISTRAR))).toBe("42501");
  });

  it("service_role ya no puede tocar señales, avisos ni tildes (era de la API HTTP)", async () => {
    const r = await registrar();
    expect(
      await codigoDeError(comoRol(db, "service_role", `update public.senales set estado = 'tomada' where id = ${r.senal_id}`)),
    ).toBe("42501");
    expect(await codigoDeError(comoRol(db, "service_role", "select * from public.avisos_easytrading"))).toBe("42501");
    expect(await codigoDeError(comoRol(db, "service_role", "update public.activos set activo = false"))).toBe("42501");
    expect(
      await codigoDeError(comoRol(db, "service_role", "update public.configuracion set easytrading_visto_en = now()")),
    ).toBe("42501");
  });

  it("anon no lee nada de F3", async () => {
    for (const t of ["configuracion", "feriados", "senales", "avisos_easytrading"]) {
      expect(await codigoDeError(comoRol(db, "anon", `select * from public.${t}`))).toBe("42501");
    }
  });

  it("el panel lee señales, avisos, configuración y feriados", async () => {
    await registrar();
    for (const t of ["configuracion", "feriados", "senales", "avisos_easytrading"]) {
      await comoRol(db, "authenticated", `select * from public.${t}`);
    }
    expect(await comoRol(db, "authenticated", "select id from public.senales")).toHaveLength(1);
  });

  it("el panel cambia el interruptor y el horario, pero no la última consulta de EasyTrading", async () => {
    await comoRol(db, "authenticated", "update public.configuracion set envio_activado = false, envio_cambiado_en = now() where id = 1");
    await comoRol(db, "authenticated", "update public.configuracion set hora_apertura = '11:30', horario_cambiado_en = now() where id = 1");
    expect(
      await codigoDeError(comoRol(db, "authenticated", "update public.configuracion set easytrading_visto_en = now()")),
    ).toBe("42501");
  });

  it("el horario tiene que abrir antes de cerrar", async () => {
    expect(
      await codigoDeError(comoRol(db, "authenticated", "update public.configuracion set hora_apertura = '18:00' where id = 1")),
    ).toBe("23514");
  });

  it("el panel carga y borra feriados", async () => {
    await comoRol(db, "authenticated", "insert into public.feriados (fecha, descripcion) values ('2026-12-25', 'Navidad')");
    await comoRol(db, "authenticated", "delete from public.feriados where fecha = '2026-12-25'");
  });

  it("el panel no puede crear, cambiar ni borrar señales ni avisos", async () => {
    const r = await registrar();
    expect(await codigoDeError(comoRol(db, "authenticated", `update public.senales set estado = 'tomada' where id = ${r.senal_id}`))).toBe("42501");
    expect(await codigoDeError(comoRol(db, "authenticated", `delete from public.senales`))).toBe("42501");
    expect(
      await codigoDeError(
        comoRol(db, "authenticated", "insert into public.avisos_easytrading (ticker_byma, estrategia, cerrada_en, resultado) values ('A', 'corto', now(), 'destildado')"),
      ),
    ).toBe("42501");
  });

  it("service_role no puede borrar alertas ni señales, ni cambiar el tilde de intradía", async () => {
    await registrar();
    expect(await codigoDeError(comoRol(db, "service_role", "delete from public.alertas"))).toBe("42501");
    expect(await codigoDeError(comoRol(db, "service_role", "delete from public.senales"))).toBe("42501");
    expect(
      await codigoDeError(comoRol(db, "service_role", "update public.activos set operar_hoy_fecha = null")),
    ).toBe("42501");
  });

  it("el keepalive (F2) sigue pudiendo leer alertas como service_role", async () => {
    await comoRol(db, "service_role", "select id from public.alertas limit 1");
  });
});
