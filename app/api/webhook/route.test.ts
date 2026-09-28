import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Base falsa: registra qué se insertó en cada tabla.
const inserts: { tabla: string; fila: Record<string, unknown> }[] = [];
let fallarInsert = false;

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
          select: () => ({ single: async () => ({ data: error ? null : { id: 42 }, error }) }),
        };
      },
    }),
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
  fallarInsert = false;
  vi.stubEnv("WEBHOOK_CLAVE", CLAVE);
  vi.stubEnv("VERCEL_ENV", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/webhook", () => {
  it("alerta válida → 200, guardada como recibida y sin la clave", async () => {
    const r = await POST(pedido(mensaje));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, id: 42, estado: "recibida" });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].tabla).toBe("alertas");
    expect(inserts[0].fila).toMatchObject({ ticker: "AAPL", origen: "tradingview", estado: "recibida" });
    expect(JSON.stringify(inserts)).not.toContain(CLAVE);
  });

  it("acepta application/json igual que text/plain", async () => {
    const r = await POST(pedido(mensaje, { "content-type": "application/json" }));
    expect(r.status).toBe(200);
  });

  it("datos inválidos con clave correcta → 200, guardada como descartada", async () => {
    const r = await POST(pedido({ ...mensaje, accion: "sl" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, estado: "descartada" });
    expect(inserts[0].fila).toMatchObject({ estado: "descartada" });
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
  });

  it("la base falla al guardar la alerta → 500", async () => {
    fallarInsert = true;
    const r = await POST(pedido(mensaje));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false });
  });
});
