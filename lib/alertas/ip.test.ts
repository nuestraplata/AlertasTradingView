import { describe, expect, it } from "vitest";
import { IPS_TRADINGVIEW, ipDelPedido, ipsPermitidas } from "./ip";

describe("ipDelPedido", () => {
  it("prefiere x-real-ip", () => {
    expect(ipDelPedido(new Headers({ "x-real-ip": "52.89.214.238", "x-forwarded-for": "1.1.1.1" }))).toBe(
      "52.89.214.238",
    );
  });

  it("si no, el primer valor de x-forwarded-for", () => {
    expect(ipDelPedido(new Headers({ "x-forwarded-for": " 34.212.75.30 , 10.0.0.1" }))).toBe("34.212.75.30");
  });

  it("sin cabeceras (local) → null", () => {
    expect(ipDelPedido(new Headers())).toBeNull();
  });

  it("recorta valores absurdamente largos", () => {
    expect(ipDelPedido(new Headers({ "x-real-ip": "x".repeat(500) }))!.length).toBe(100);
  });
});

describe("ipsPermitidas", () => {
  it("en producción: las 4 IPs de TradingView", () => {
    expect(ipsPermitidas("production")).toEqual(IPS_TRADINGVIEW);
    expect(IPS_TRADINGVIEW).toHaveLength(4);
  });

  it("en preview y local no filtra", () => {
    expect(ipsPermitidas("preview")).toBeNull();
    expect(ipsPermitidas("development")).toBeNull();
    expect(ipsPermitidas(undefined)).toBeNull();
  });
});
