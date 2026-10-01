import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { baseConMigraciones, comoRol, rpcComoServidor } from "@/supabase/tests/base";

// API de EasyTrading de punta a punta: las rutas reales contra las
// funciones reales de la migración 4 (PGlite). Solo se reemplaza el
// cliente de Supabase por uno que llama a esa base como service_role.

let db: PGlite;
let ahora = "2026-10-01T17:00:00Z"; // jueves 14:00 en Argentina
const avanzar = (segundos: number) => {
  ahora = new Date(new Date(ahora).getTime() + segundos * 1000).toISOString();
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: rpcComoServidor(db, () => ahora),
    from: () => {
      throw new Error("no se esperaba un insert directo");
    },
  }),
}));

const { POST: webhook } = await import("@/app/api/webhook/route");
const { GET: pendientes } = await import("./senales/route");
const { POST: tomar } = await import("./senales/[id]/tomar/route");
const { POST: resultado } = await import("./senales/[id]/resultado/route");
const { POST: posicionCerrada } = await import("./posicion-cerrada/route");

const TOKEN = "token-de-easytrading-de-prueba-24+";
const CLAVE = "clave-del-webhook-de-prueba-24+++";

function pedido(ruta: string, opciones: { metodo?: string; cuerpo?: unknown; token?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = opciones.token === undefined ? TOKEN : opciones.token;
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request(`http://localhost${ruta}`, {
    method: opciones.metodo ?? "POST",
    headers,
    body:
      opciones.cuerpo === undefined
        ? undefined
        : typeof opciones.cuerpo === "string"
          ? opciones.cuerpo
          : JSON.stringify(opciones.cuerpo),
  });
}
const conId = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

async function alertaTradingView(campos: Record<string, string> = {}) {
  const r = await webhook(
    pedido("/api/webhook", {
      token: null,
      cuerpo: { clave: CLAVE, estrategia: "corto", accion: "compra", ticker: "NASDAQ:AAPL", precio: "185.5", ...campos },
    }),
  );
  return (await r.json()) as { ok: boolean; id: number; estado: string };
}
async function listar() {
  const r = await pendientes(pedido("/api/easytrading/senales", { metodo: "GET" }));
  expect(r.status).toBe(200);
  return (await r.json()) as { ok: true; envio_activado: boolean; senales: { id: number; alerta_id: number }[] };
}

beforeAll(async () => {
  db = await baseConMigraciones();
}, 60_000);

beforeEach(async () => {
  ahora = "2026-10-01T17:00:00Z";
  vi.stubEnv("EASYTRADING_TOKEN", TOKEN);
  vi.stubEnv("WEBHOOK_CLAVE", CLAVE);
  vi.stubEnv("VERCEL_ENV", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  await db.exec(`
    truncate public.avisos_easytrading, public.senales, public.alertas, public.activos,
             public.tickers restart identity cascade;
    update public.configuracion set envio_activado = true, easytrading_visto_en = null;
    insert into public.tickers (ticker_usa, ticker_byma) values ('AAPL', 'AAPL'), ('KO', 'KO');
    insert into public.activos (ticker_usa, estrategia, activo) values ('AAPL', 'corto', true), ('KO', 'corto', false);
  `);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("autenticación", () => {
  const llamadas: [string, () => Promise<Response>][] = [
    ["GET senales", () => pendientes(pedido("/api/easytrading/senales", { metodo: "GET", token: null }))],
    ["tomar", () => tomar(pedido("/x", { token: null }), conId(1))],
    ["resultado", () => resultado(pedido("/x", { token: null, cuerpo: {} }), conId(1))],
    ["posicion-cerrada", () => posicionCerrada(pedido("/x", { token: null, cuerpo: {} }))],
  ];

  it.each(llamadas)("%s sin token → 401", async (_n, llamar) => {
    const r = await llamar();
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ ok: false });
  });

  it.each(["otro-token", `${TOKEN}x`, TOKEN.toUpperCase()])("token incorrecto (%s) → 401", async (token) => {
    const r = await pendientes(pedido("/api/easytrading/senales", { metodo: "GET", token }));
    expect(r.status).toBe(401);
  });

  it("'bearer' en minúscula → 401", async () => {
    const r = await pendientes(
      new Request("http://localhost/api/easytrading/senales", { headers: { authorization: `bearer ${TOKEN}` } }),
    );
    expect(r.status).toBe(401);
  });

  it("falta EASYTRADING_TOKEN en el servidor → 500 (nunca acepta un token vacío)", async () => {
    vi.stubEnv("EASYTRADING_TOKEN", "");
    const r = await pendientes(pedido("/api/easytrading/senales", { metodo: "GET", token: "" }));
    expect(r.status).toBe(500);
  });

  it("las respuestas no se cachean", async () => {
    const r = await pendientes(pedido("/api/easytrading/senales", { metodo: "GET" }));
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});

describe("flujo completo: alerta → señal → tomar → resultado", () => {
  it("una compra tildada llega a EasyTrading, se toma una sola vez y guarda el resultado", async () => {
    const alerta = await alertaTradingView();
    expect(alerta).toMatchObject({ ok: true, estado: "senal" });

    avanzar(2);
    const lista = await listar();
    expect(lista.envio_activado).toBe(true);
    expect(lista.senales).toEqual([
      expect.objectContaining({
        alerta_id: alerta.id,
        ticker_byma: "AAPL",
        ticker_usa: "AAPL",
        estrategia: "corto",
        accion: "compra",
        precio_usd: 185.5,
        origen: "tradingview",
        estado: "pendiente",
      }),
    ]);
    const id = lista.senales[0].id;

    const t1 = await tomar(pedido("/x"), conId(id));
    expect(t1.status).toBe(200);
    expect(await t1.json()).toMatchObject({ ok: true, senal: { id, estado: "tomada" } });

    const t2 = await tomar(pedido("/x"), conId(id));
    expect(t2.status).toBe(409);
    expect(await t2.json()).toEqual({ ok: false, error: "no_disponible", estado: "tomada" });
    expect((await listar()).senales).toEqual([]);

    const ejecutada = { estado: "ejecutada", precio_ars: 15230.5, nominales: 10, modo: "PAPER" };
    const r1 = await resultado(pedido("/x", { cuerpo: ejecutada }), conId(id));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ ok: true, estado: "ejecutada", repetido: false });

    const r2 = await resultado(pedido("/x", { cuerpo: ejecutada }), conId(id));
    expect(await r2.json()).toEqual({ ok: true, estado: "ejecutada", repetido: true });

    const r3 = await resultado(pedido("/x", { cuerpo: { estado: "descartada", motivo: "x" } }), conId(id));
    expect(r3.status).toBe(409);

    const [s] = await comoRol<Record<string, unknown>>(db, "postgres", "select * from public.senales where id = $1", [id]);
    expect(s).toMatchObject({ estado: "ejecutada", resultado_nominales: 10, resultado_modo: "PAPER" });
  });

  it("EasyTrading descarta la señal con su motivo", async () => {
    await alertaTradingView({ ticker: "KO", accion: "venta" });
    const [{ id }] = (await listar()).senales;
    await tomar(pedido("/x"), conId(id));
    const r = await resultado(pedido("/x", { cuerpo: { estado: "descartada", motivo: " sin posición abierta " } }), conId(id));
    expect(r.status).toBe(200);
    const [s] = await comoRol<Record<string, unknown>>(db, "postgres", "select resultado_motivo from public.senales where id = $1", [id]);
    expect(s.resultado_motivo).toBe("sin posición abierta");
  });

  it("a los 60 s vence: no se lista y no se puede tomar", async () => {
    await alertaTradingView();
    avanzar(30);
    const [{ id }] = (await listar()).senales;
    avanzar(30);
    expect((await listar()).senales).toEqual([]);
    const t = await tomar(pedido("/x"), conId(id));
    expect(t.status).toBe(409);
    expect(await t.json()).toEqual({ ok: false, error: "no_disponible", estado: "vencida" });
  });

  it("en pausa: la lista viene vacía y tomar responde 409 'pausado'", async () => {
    await alertaTradingView();
    const [{ id }] = (await listar()).senales;
    await db.exec("update public.configuracion set envio_activado = false");
    expect(await listar()).toEqual({ ok: true, envio_activado: false, senales: [] });
    const t = await tomar(pedido("/x"), conId(id));
    expect(t.status).toBe(409);
    expect(await t.json()).toMatchObject({ error: "pausado" });
  });

  it("anota la hora de la última consulta", async () => {
    await listar();
    const [c] = await comoRol<{ easytrading_visto_en: Date }>(db, "postgres", "select easytrading_visto_en from public.configuracion");
    expect(c.easytrading_visto_en.toISOString()).toBe(new Date(ahora).toISOString());
  });
});

describe("validaciones", () => {
  it.each(["abc", "0", "-1", "1.5", "99999999999999999"])("id inválido (%s) → 400", async (id) => {
    expect((await tomar(pedido("/x"), conId(id))).status).toBe(400);
    expect((await resultado(pedido("/x", { cuerpo: { estado: "descartada", motivo: "x" } }), conId(id))).status).toBe(400);
  });

  it("señal inexistente → 404", async () => {
    expect((await tomar(pedido("/x"), conId(999))).status).toBe(404);
    expect((await resultado(pedido("/x", { cuerpo: { estado: "descartada", motivo: "x" } }), conId(999))).status).toBe(404);
  });

  it.each([
    ["sin estado", {}],
    ["estado desconocido", { estado: "parcial" }],
    ["ejecutada sin nominales", { estado: "ejecutada", precio_ars: 1, modo: "PAPER" }],
    ["nominales con decimales", { estado: "ejecutada", precio_ars: 1, nominales: 1.5, modo: "PAPER" }],
    ["precio como texto", { estado: "ejecutada", precio_ars: "1", nominales: 1, modo: "PAPER" }],
    ["modo inválido", { estado: "ejecutada", precio_ars: 1, nominales: 1, modo: "real" }],
    ["descartada sin motivo", { estado: "descartada", motivo: "  " }],
  ])("resultado inválido (%s) → 400 con detalle", async (_caso, cuerpo) => {
    const r = await resultado(pedido("/x", { cuerpo }), conId(1));
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ ok: false, error: "datos_invalidos", detalle: expect.any(Object) });
  });

  it("cuerpo que no es JSON → 400", async () => {
    const r = await resultado(pedido("/x", { cuerpo: "hola" }), conId(1));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ ok: false, error: "json_invalido" });
  });

  it("cuerpo de más de 10 KB → 413", async () => {
    const r = await resultado(pedido("/x", { cuerpo: { estado: "descartada", motivo: "x".repeat(11_000) } }), conId(1));
    expect(r.status).toBe(413);
  });
});

describe("posición de corto cerrada", () => {
  const aviso = { ticker_byma: "aapl", estrategia: "corto", cerrada_en: "2026-10-01T16:30:00-03:00", senal_id: 5 };

  it("destilda 'activo' en corto; repetir el mismo aviso responde OK sin volver a destildar", async () => {
    const r = await posicionCerrada(pedido("/x", { cuerpo: aviso }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, resultado: "destildado", repetido: false });
    const [a] = await comoRol<{ activo: boolean }>(db, "postgres", "select activo from public.activos where ticker_usa = 'AAPL'");
    expect(a.activo).toBe(false);

    const r2 = await posicionCerrada(pedido("/x", { cuerpo: aviso }));
    expect(await r2.json()).toEqual({ ok: true, resultado: "destildado", repetido: true });
  });

  it("ticker desconocido → 200 y queda registrado", async () => {
    const r = await posicionCerrada(pedido("/x", { cuerpo: { ...aviso, ticker_byma: "ZZZ" } }));
    expect(await r.json()).toMatchObject({ ok: true, resultado: "ticker_desconocido" });
  });

  it.each([
    ["intradía", { ...aviso, estrategia: "intradia" }],
    ["fecha sin zona horaria", { ...aviso, cerrada_en: "2026-10-01 16:30" }],
    ["ticker con sufijo", { ...aviso, ticker_byma: "AAPL.BA" }],
    ["sin ticker", { estrategia: "corto", cerrada_en: aviso.cerrada_en }],
  ])("inválido (%s) → 400 y no toca nada", async (_caso, cuerpo) => {
    const r = await posicionCerrada(pedido("/x", { cuerpo }));
    expect(r.status).toBe(400);
    const [{ n }] = await comoRol<{ n: number }>(db, "postgres", "select count(*)::int n from public.avisos_easytrading");
    expect(n).toBe(0);
  });
});
