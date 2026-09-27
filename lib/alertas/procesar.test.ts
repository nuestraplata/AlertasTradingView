import { describe, expect, it } from "vitest";
import { MAX_BYTES_CUERPO, procesarAlerta, type EntradaProceso } from "./procesar";

const CLAVE = "clave-super-secreta";

/** Mensaje tal como lo manda TradingView (todo texto). */
const mensaje = {
  clave: CLAVE,
  estrategia: "corto",
  accion: "compra",
  ticker: "AAPL",
  precio: "185.5",
  hora: "2026-09-27T14:00:00Z",
};

function procesar(cuerpo: unknown, extra: Partial<EntradaProceso> = {}) {
  return procesarAlerta({
    cuerpo: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
    origen: "tradingview",
    claveEsperada: CLAVE,
    ip: "52.89.214.238",
    ipsPermitidas: null,
    ...extra,
  });
}

function alerta(cuerpo: unknown, extra: Partial<EntradaProceso> = {}) {
  const r = procesar(cuerpo, extra);
  if (r.tipo !== "alerta") throw new Error(`esperaba alerta, vino rechazo ${r.motivo}`);
  return r.alerta;
}

describe("procesarAlerta: alerta válida", () => {
  it("la registra como recibida, con datos normalizados y sin la clave", () => {
    const r = procesar(mensaje);
    expect(r).toEqual({
      tipo: "alerta",
      http: 200,
      alerta: {
        origen: "tradingview",
        payload: {
          estrategia: "corto",
          accion: "compra",
          ticker: "AAPL",
          precio: "185.5",
          hora: "2026-09-27T14:00:00Z",
        },
        ticker: "AAPL",
        estrategia: "corto",
        accion: "compra",
        precio_usd: 185.5,
        hora_tv: "2026-09-27T14:00:00Z",
        estado: "recibida",
        motivo: null,
      },
    });
  });

  it("nunca deja la clave en el payload", () => {
    expect(alerta(mensaje).payload).not.toHaveProperty("clave");
    expect(JSON.stringify(alerta(mensaje))).not.toContain(CLAVE);
  });

  it("normaliza mayúsculas/minúsculas y espacios", () => {
    const a = alerta({ ...mensaje, estrategia: " Intradia ", accion: "VENTA", ticker: " brk.b " });
    expect(a).toMatchObject({ estrategia: "intradia", accion: "venta", ticker: "BRK.B", estado: "recibida" });
  });

  it("saca el prefijo de mercado del ticker (NASDAQ:AAPL → AAPL)", () => {
    expect(alerta({ ...mensaje, ticker: "NASDAQ:AAPL" }).ticker).toBe("AAPL");
    expect(alerta({ ...mensaje, ticker: "BATS:BRK.B" }).ticker).toBe("BRK.B");
  });

  it("precio como número o texto; redondea a 6 decimales; acepta coma", () => {
    expect(alerta({ ...mensaje, precio: 185.25 }).precio_usd).toBe(185.25);
    expect(alerta({ ...mensaje, precio: "0.123456789" }).precio_usd).toBe(0.123457);
    expect(alerta({ ...mensaje, precio: "185,5" }).precio_usd).toBe(185.5);
  });

  it("la hora de TradingView es opcional (solo registro)", () => {
    const sinHora: Partial<typeof mensaje> = { ...mensaje };
    delete sinHora.hora;
    expect(alerta(sinHora)).toMatchObject({ hora_tv: null, estado: "recibida" });
  });

  it("marca el origen simulado", () => {
    expect(alerta(mensaje, { origen: "simulada" }).origen).toBe("simulada");
  });

  it("guarda campos extra del mensaje en el payload", () => {
    expect(alerta({ ...mensaje, nota: "x" }).payload).toMatchObject({ nota: "x" });
  });
});

describe("procesarAlerta: clave correcta pero datos inválidos → descartada con motivo", () => {
  it.each([
    [{ accion: "sl" }, /"accion" inválida: "sl" \(válidas: compra, venta\)/],
    [{ accion: "tp" }, /"accion" inválida: "tp"/],
    [{ estrategia: "swing" }, /"estrategia" inválida: "swing"/],
    [{ ticker: "aa pl" }, /"ticker" inválido/],
    [{ precio: "abc" }, /"precio" inválido: "abc"/],
    [{ precio: "0" }, /"precio" inválido/],
    [{ precio: "-5" }, /"precio" inválido/],
    [{ precio: "{{close}}" }, /"precio" inválido: "\{\{close\}\}"/],
    [{ estrategia: undefined }, /Falta "estrategia"/],
    [{ ticker: "" }, /Falta "ticker"/],
    [{ precio: null }, /Falta "precio"/],
  ])("%j", (cambio, motivo) => {
    const a = alerta({ ...mensaje, ...cambio });
    expect(a.estado).toBe("descartada");
    expect(a.motivo).toMatch(motivo);
  });

  it("guarda lo que sí vino bien y junta todos los motivos", () => {
    const a = alerta({ ...mensaje, accion: "sl", precio: "abc" });
    expect(a).toMatchObject({ ticker: "AAPL", estrategia: "corto", accion: null, precio_usd: null });
    expect(a.motivo).toMatch(/"accion" inválida.*"precio" inválido/);
  });

  it("recorta valores larguísimos en el motivo", () => {
    const a = alerta({ ...mensaje, accion: "x".repeat(200) });
    expect(a.motivo!.length).toBeLessThan(120);
    expect(a.motivo).toContain("…");
  });
});

describe("procesarAlerta: rechazos (se registran como intento, sin payload)", () => {
  it("clave incorrecta, vacía, ausente o de otro tipo → 401", () => {
    for (const clave of ["otra", "", undefined, 123, null]) {
      expect(procesar({ ...mensaje, clave })).toEqual({ tipo: "rechazo", motivo: "clave_invalida", http: 401 });
    }
  });

  it("clave esperada vacía (variable sin configurar) → rechaza todo", () => {
    expect(procesar({ ...mensaje, clave: "" }, { claveEsperada: "" })).toMatchObject({ motivo: "clave_invalida" });
  });

  it("clave con otra capitalización → 401 (es exacta)", () => {
    expect(procesar({ ...mensaje, clave: CLAVE.toUpperCase() })).toMatchObject({ motivo: "clave_invalida" });
  });

  it.each(["no es json", "", "[1,2]", "null", '"texto"', "{mal json"])(
    "mensaje ilegible %j → 400",
    (cuerpo) => {
      expect(procesar(cuerpo)).toEqual({ tipo: "rechazo", motivo: "mensaje_ilegible", http: 400 });
    },
  );

  it("cuerpo demasiado grande → 413, antes de leerlo", () => {
    const grande = JSON.stringify({ ...mensaje, relleno: "x".repeat(MAX_BYTES_CUERPO) });
    expect(procesar(grande)).toEqual({ tipo: "rechazo", motivo: "cuerpo_demasiado_grande", http: 413 });
  });

  it("IP fuera de la lista (si hay lista) → 403, aun con clave correcta", () => {
    const lista = ["52.89.214.238"];
    expect(procesar(mensaje, { ipsPermitidas: lista, ip: "1.2.3.4" })).toMatchObject({ motivo: "ip_no_permitida", http: 403 });
    expect(procesar(mensaje, { ipsPermitidas: lista, ip: null })).toMatchObject({ motivo: "ip_no_permitida" });
    expect(procesar(mensaje, { ipsPermitidas: lista })).toMatchObject({ tipo: "alerta" });
  });

  it("sin lista de IPs (desarrollo / simulador) no filtra por IP", () => {
    expect(procesar(mensaje, { ipsPermitidas: null, ip: "1.2.3.4" })).toMatchObject({ tipo: "alerta" });
  });
});
