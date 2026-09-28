import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consultas: string[] = [];
let errorBase: { code: string; message: string } | null = null;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => ({
      select: () => ({
        limit: async () => {
          consultas.push(tabla);
          return { data: [], error: errorBase };
        },
      }),
    }),
  }),
}));

const { GET } = await import("./route");

const SECRETO = "secreto-del-cron-con-24-caracteres";

function pedido(auth?: string) {
  return new Request("http://localhost/api/cron/keepalive", {
    headers: auth === undefined ? {} : { authorization: auth },
  });
}

beforeEach(() => {
  consultas.length = 0;
  errorBase = null;
  vi.stubEnv("CRON_SECRET", SECRETO);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/keepalive", () => {
  it("con el secreto correcto → consulta Supabase y responde 200", async () => {
    const r = await GET(pedido(`Bearer ${SECRETO}`));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true });
    // Tabla donde service_role tiene SELECT (verificado en Postgres local).
    expect(consultas).toEqual(["alertas"]);
  });

  // (Espacios al final no se prueban: la API Headers los recorta, como manda HTTP.)
  it.each([undefined, "", SECRETO, `Bearer otro`, `bearer ${SECRETO}`, `Bearer ${SECRETO}x`, `Bearer  ${SECRETO}`])(
    "sin autorización válida (%j) → 401 y no consulta nada",
    async (auth) => {
      const r = await GET(pedido(auth));
      expect(r.status).toBe(401);
      expect(consultas).toHaveLength(0);
    },
  );

  it("falta CRON_SECRET en el servidor → 500 (nunca acepta un secreto vacío)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const r = await GET(pedido("Bearer "));
    expect(r.status).toBe(500);
    expect(consultas).toHaveLength(0);
  });

  it("Supabase falla → 502 y queda en el log", async () => {
    errorBase = { code: "PGRST000", message: "caído" };
    const r = await GET(pedido(`Bearer ${SECRETO}`));
    expect(r.status).toBe(502);
    expect(console.error).toHaveBeenCalled();
  });
});
