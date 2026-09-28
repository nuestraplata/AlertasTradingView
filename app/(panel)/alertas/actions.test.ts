import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inserts: { tabla: string; fila: Record<string, unknown> }[] = [];
let haySesion = true;

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
    from: (tabla: string) => ({
      insert: (fila: Record<string, unknown>) => {
        inserts.push({ tabla, fila });
        return { select: () => ({ single: async () => ({ data: { id: 7 }, error: null }) }) };
      },
    }),
  }),
}));

const { simularAlerta } = await import("./actions");

const CLAVE = "clave-real-del-servidor-de-24+";

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  inserts.length = 0;
  haySesion = true;
  vi.stubEnv("WEBHOOK_CLAVE", CLAVE);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("simularAlerta", () => {
  it("modo simple válido → alerta simulada recibida, sin clave guardada", async () => {
    const r = await simularAlerta(
      undefined,
      form({ modo: "simple", estrategia: "corto", accion: "compra", ticker: "aapl", precio: "185.5" }),
    );
    expect(r).toMatchObject({ ok: true, id: 7, estado: "recibida", motivo: null, valores: { ticker: "aapl" } });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      tabla: "alertas",
      fila: { origen: "simulada", ticker: "AAPL", estado: "recibida" },
    });
    expect(JSON.stringify(inserts)).not.toContain(CLAVE);
  });

  it("datos inválidos → se guarda descartada con motivo (igual que en producción)", async () => {
    const r = await simularAlerta(
      undefined,
      form({ modo: "simple", estrategia: "corto", accion: "sl", ticker: "AAPL", precio: "1" }),
    );
    expect(r).toMatchObject({ ok: true, estado: "descartada" });
    if (r?.ok) expect(r.motivo).toMatch(/"accion" inválida: "sl"/);
  });

  it("modo JSON: la clave pegada (CLAVE_SECRETA) se reemplaza por la real", async () => {
    const json = '{"clave":"CLAVE_SECRETA","estrategia":"intradia","accion":"venta","ticker":"{{ticker}}","precio":"{{close}}","hora":"{{timenow}}"}';
    const r = await simularAlerta(undefined, form({ modo: "json", json, ticker: "NASDAQ:MELI", precio: "1650" }));
    expect(r).toMatchObject({ ok: true, estado: "recibida" });
    expect(inserts[0].fila).toMatchObject({ ticker: "MELI", precio_usd: 1650, estrategia: "intradia" });
    expect(JSON.stringify(inserts)).not.toContain("CLAVE_SECRETA");
  });

  it("modo JSON mal armado → error, conserva lo escrito, no registra nada", async () => {
    const r = await simularAlerta(undefined, form({ modo: "json", json: "{mal", ticker: "", precio: "" }));
    expect(r).toMatchObject({ ok: false, valores: { json: "{mal" } });
    expect(inserts).toHaveLength(0);
  });

  it("sin sesión → no hace nada (redirige a /login)", async () => {
    haySesion = false;
    await expect(
      simularAlerta(undefined, form({ modo: "simple", estrategia: "corto", accion: "compra", ticker: "AAPL", precio: "1" })),
    ).rejects.toThrow(/login/);
    expect(inserts).toHaveLength(0);
  });

  it("falta WEBHOOK_CLAVE → error de configuración, no registra", async () => {
    vi.stubEnv("WEBHOOK_CLAVE", "");
    const r = await simularAlerta(
      undefined,
      form({ modo: "simple", estrategia: "corto", accion: "compra", ticker: "AAPL", precio: "1" }),
    );
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Falta configurar/) });
    expect(inserts).toHaveLength(0);
  });
});
