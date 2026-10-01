import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcs: { funcion: string; args: Record<string, unknown> }[] = [];
let haySesion = true;
let respuestaFiltro: Record<string, unknown> = {};

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/sesion", () => ({
  clienteConSesion: async () => {
    if (!haySesion) throw new Error("NEXT_REDIRECT /login");
    return { supabase: {}, claims: {} };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      throw new Error("el simulador no inserta directo");
    },
    rpc: async (funcion: string, args: Record<string, unknown>) => {
      rpcs.push({ funcion, args });
      return { data: respuestaFiltro, error: null };
    },
  }),
}));

const { simularAlerta } = await import("./actions");
const { MOTIVO_SIMULADA_NO_ENVIADA } = await import("@/lib/alertas/registrar");

const CLAVE = "clave-real-del-servidor-de-24+";

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  rpcs.length = 0;
  haySesion = true;
  respuestaFiltro = { alerta_id: 7, estado: "descartada", motivo: "pausado", senal_id: null };
  vi.stubEnv("WEBHOOK_CLAVE", CLAVE);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("simularAlerta", () => {
  it("modo simple válido → pasa por el filtro como simulada, sin enviar y sin la clave", async () => {
    respuestaFiltro = { alerta_id: 7, estado: "descartada", motivo: MOTIVO_SIMULADA_NO_ENVIADA, senal_id: null };
    const r = await simularAlerta(
      undefined,
      form({ modo: "simple", estrategia: "corto", accion: "compra", ticker: "aapl", precio: "185.5" }),
    );
    expect(r).toMatchObject({
      ok: true,
      id: 7,
      estado: "descartada",
      motivo: MOTIVO_SIMULADA_NO_ENVIADA,
      senalId: null,
      valores: { ticker: "aapl" },
    });
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0]).toMatchObject({
      funcion: "registrar_alerta",
      args: { p_origen: "simulada", p_ticker: "AAPL", p_motivo: null, p_enviar_simulada: false },
    });
    expect(JSON.stringify(rpcs)).not.toContain(CLAVE);
  });

  it("con 'enviar' tildado → pide generar la señal", async () => {
    respuestaFiltro = { alerta_id: 8, estado: "senal", motivo: null, senal_id: 3 };
    const r = await simularAlerta(
      undefined,
      form({ modo: "simple", estrategia: "corto", accion: "compra", ticker: "AAPL", precio: "1", enviar: "on" }),
    );
    expect(r).toMatchObject({ ok: true, id: 8, estado: "senal", senalId: 3 });
    expect(rpcs[0].args).toMatchObject({ p_enviar_simulada: true });
  });

  it("datos inválidos → se guarda descartada con motivo (igual que en producción)", async () => {
    respuestaFiltro = { alerta_id: 9, estado: "descartada", motivo: '"accion" inválida: "sl"', senal_id: null };
    const r = await simularAlerta(
      undefined,
      form({ modo: "simple", estrategia: "corto", accion: "sl", ticker: "AAPL", precio: "1" }),
    );
    expect(r).toMatchObject({ ok: true, estado: "descartada" });
    expect(rpcs[0].args).toMatchObject({ p_accion: null, p_motivo: expect.stringMatching(/"accion" inválida: "sl"/) });
  });

  it("modo JSON: la clave pegada (CLAVE_SECRETA) se reemplaza por la real", async () => {
    const json = '{"clave":"CLAVE_SECRETA","estrategia":"intradia","accion":"venta","ticker":"{{ticker}}","precio":"{{close}}","hora":"{{timenow}}"}';
    const r = await simularAlerta(undefined, form({ modo: "json", json, ticker: "NASDAQ:MELI", precio: "1650" }));
    expect(r).toMatchObject({ ok: true });
    expect(rpcs[0].args).toMatchObject({ p_ticker: "MELI", p_precio_usd: 1650, p_estrategia: "intradia" });
    expect(JSON.stringify(rpcs)).not.toContain("CLAVE_SECRETA");
  });

  it("modo JSON mal armado → error, conserva lo escrito, no registra nada", async () => {
    const r = await simularAlerta(undefined, form({ modo: "json", json: "{mal", ticker: "", precio: "" }));
    expect(r).toMatchObject({ ok: false, valores: { json: "{mal" } });
    expect(rpcs).toHaveLength(0);
  });

  it("sin sesión → no hace nada (redirige a /login)", async () => {
    haySesion = false;
    await expect(
      simularAlerta(undefined, form({ modo: "simple", estrategia: "corto", accion: "compra", ticker: "AAPL", precio: "1" })),
    ).rejects.toThrow(/login/);
    expect(rpcs).toHaveLength(0);
  });

  it("falta WEBHOOK_CLAVE → error de configuración, no registra", async () => {
    vi.stubEnv("WEBHOOK_CLAVE", "");
    const r = await simularAlerta(
      undefined,
      form({ modo: "simple", estrategia: "corto", accion: "compra", ticker: "AAPL", precio: "1" }),
    );
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Falta configurar/) });
    expect(rpcs).toHaveLength(0);
  });
});
