import { describe, expect, it } from "vitest";
import { describirError } from "./errores";

describe("describirError", () => {
  it("muestra el mensaje de un error simple", () => {
    expect(describirError(new Error("algo"))).toBe("Error: algo");
  });

  it("recorre la cadena de cause con sus códigos (caso DNS)", () => {
    const dns = Object.assign(new Error("getaddrinfo ENOTFOUND x.supabase.co"), {
      code: "ENOTFOUND",
      syscall: "getaddrinfo",
      hostname: "x.supabase.co",
    });
    const e = new TypeError("fetch failed", { cause: dns });
    expect(describirError(e)).toBe(
      "TypeError: fetch failed\n" +
        "causa: Error: getaddrinfo ENOTFOUND x.supabase.co " +
        "(code=ENOTFOUND, syscall=getaddrinfo, hostname=x.supabase.co)",
    );
  });

  it("lista los errores internos de un AggregateError", () => {
    const agg = new AggregateError(
      [
        Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT", address: "1.2.3.4", port: 443 }),
        Object.assign(new Error("connect ENETUNREACH"), { code: "ENETUNREACH" }),
      ],
      "",
    );
    const texto = describirError(new TypeError("fetch failed", { cause: agg }));
    expect(texto).toContain("causa: AggregateError");
    expect(texto).toContain("  - Error: connect ETIMEDOUT (code=ETIMEDOUT, address=1.2.3.4, port=443)");
    expect(texto).toContain("  - Error: connect ENETUNREACH (code=ENETUNREACH)");
  });

  it("acepta valores que no son Error", () => {
    expect(describirError("texto")).toBe("texto");
  });

  it("corta cadenas de cause circulares", () => {
    const a = new Error("a");
    (a as { cause?: unknown }).cause = a;
    expect(describirError(a, 3).split("\n")).toHaveLength(3);
  });
});
