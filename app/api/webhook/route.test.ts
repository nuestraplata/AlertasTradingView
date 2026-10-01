import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Base falsa: registra qué se insertó en cada tabla y qué funciones se
// llamaron. Las reglas del filtro se prueban contra Postgres real en
// supabase/tests/senales.test.ts.
const inserts: { tabla: string; fila: Record<string, unknown> }[] = [];
const rpcs: { funcion: string; args: Record<string, unknown> }[] = [];
let fallarInsert = false;
let respuestaFiltro: Record<string, unknown> = { alerta_id: 42, estado: "senal", motivo: null, senal_id: 9 };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => ({
      insert: (fila: Record<string, unknown>) => {
        const error = fallarInsert ? { code: "XX000", message: "caída" } : null;
        if (!error) inserts.push({ tabla, fila });
        const res = { error };
        return {
          ...res,
          then: (ok: (v: unknown) => unknown) => Promise.resolve(res).then(ok),
        };
      },
    }),
    rpc: async (funcion: string, args: Record<string, unknown>) => {
      if (fallarInsert) return { data: null, error: { code: "XX000", message: "caída" } };
      rpcs.push({ funcion, args });
      return { data: respuestaFiltro, error: null };
    },
  }),
}));

const { POST } = await import("./route");

const CLAVE = "clave-de-prueba-con-24-caracteres!";
const mensaje = { clave: CLAVE, estrategia: "corto", accion: "compra", ticker: "NASDAQ:AAPL", precio: "185.5" };

function pedido(cuerpo: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/webhook", {
    method: "POST",
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
    headers: { "content-type": "text/plain", ...headers },
  });
}

beforeEach(() => {
  inserts.length = 0;
  rpcs.length = 0;
  fallarInsert = false;
  respuestaFiltro = { alerta_id: 42, estado: "senal", motivo: null, senal_id: 9 };
  vi.stubEnv("WEBHOOK_CLAVE", CLAVE);
  vi.stubEnv("VERCEL_ENV", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/webhook", () => {
  it("alerta válida → pasa por el filtro de señales, 200 y sin la clave", async () => {
    const r = await POST(pedido(mensaje));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, id: 42, estado: "senal" });
    expect(inserts).toHaveLength(0);
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0]).toMatchObject({
      funcion: "registrar_alerta",
      args: {
        p_origen: "tradingview",
        p_ticker: "AAPL",
        p_estrategia: "corto",
        p_accion: "compra",
        p_precio_usd: 185.5,
        p_motivo: null,
        p_enviar_simulada: false,
      },
    });
    expect(rpcs[0].args).not.toHaveProperty("p_ahora"); // la hora la pone la base
    expect(JSON.stringify(rpcs)).not.toContain(CLAVE);
  });

  it("el filtro la descarta → 200 igual (TradingView no tiene que reintentar)", async () => {
    respuestaFiltro = { alerta_id: 43, estado: "descartada", motivo: "pausado", senal_id: null };
    const r = await POST(pedido(mensaje));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, id: 43, estado: "descartada" });
  });

  it("acepta application/json igual que text/plain", async () => {
    const r = await POST(pedido(mensaje, { "content-type": "application/json" }));
    expect(r.status).toBe(200);
  });

  it("datos inválidos con clave correcta → se guarda con el motivo, sin filtrar", async () => {
    respuestaFiltro = { alerta_id: 44, estado: "descartada", motivo: "x", senal_id: null };
    const r = await POST(pedido({ ...mensaje, accion: "sl" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, estado: "descartada" });
    expect(rpcs[0].args).toMatchObject({ p_accion: null, p_motivo: expect.stringMatching(/"accion" inválida/) });
  });

  it("clave mala → 401, solo intento con IP, sin payload, sin detalles en la respuesta", async () => {
    const r = await POST(pedido({ ...mensaje, clave: "otra" }, { "x-real-ip": "1.2.3.4" }));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ ok: false });
    expect(inserts).toEqual([
      { tabla: "intentos_rechazados", fila: { ip: "1.2.3.4", motivo: "clave_invalida" } },
    ]);
  });

  it("mensaje que no es JSON → 400 como intento", async () => {
    const r = await POST(pedido("hola"));
    expect(r.status).toBe(400);
    expect(inserts[0]).toMatchObject({ tabla: "intentos_rechazados", fila: { motivo: "mensaje_ilegible" } });
  });

  it("content-length enorme → 413 sin leer el cuerpo", async () => {
    const r = await POST(pedido(mensaje, { "content-length": "999999" }));
    expect(r.status).toBe(413);
    expect(inserts[0].fila).toMatchObject({ motivo: "cuerpo_demasiado_grande" });
  });

  it("producción: IP que no es de TradingView → 403 aunque la clave sea correcta", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const r = await POST(pedido(mensaje, { "x-real-ip": "1.2.3.4" }));
    expect(r.status).toBe(403);
    expect(inserts[0]).toMatchObject({ tabla: "intentos_rechazados", fila: { ip: "1.2.3.4", motivo: "ip_no_permitida" } });
  });

  it("producción: IP de TradingView → 200", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const r = await POST(pedido(mensaje, { "x-forwarded-for": "52.32.178.7" }));
    expect(r.status).toBe(200);
  });

  it("falta WEBHOOK_CLAVE en el servidor → 500 y no registra nada", async () => {
    vi.stubEnv("WEBHOOK_CLAVE", "");
    const r = await POST(pedido(mensaje));
    expect(r.status).toBe(500);
    expect(inserts).toHaveLength(0);
    expect(rpcs).toHaveLength(0);
  });

  it("la base falla al guardar la alerta → 500", async () => {
    fallarInsert = true;
    const r = await POST(pedido(mensaje));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false });
  });
});
