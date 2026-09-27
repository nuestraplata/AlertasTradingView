import { describe, expect, it } from "vitest";
import { validarSecreto, validarSecretKey, validarSupabaseEnv } from "./env";

const URL_OK = "https://abcdefgh.supabase.co";
const KEY_OK = "sb_publishable_abc123";

describe("validarSupabaseEnv", () => {
  it("acepta URL https y clave publishable", () => {
    expect(validarSupabaseEnv(URL_OK, KEY_OK)).toEqual({
      url: URL_OK,
      publishableKey: KEY_OK,
    });
  });

  it("normaliza la URL quitando la barra final", () => {
    expect(validarSupabaseEnv(`${URL_OK}/`, KEY_OK).url).toBe(URL_OK);
  });

  it("falla si falta la URL", () => {
    expect(() => validarSupabaseEnv(undefined, KEY_OK)).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
    expect(() => validarSupabaseEnv("", KEY_OK)).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it("falla si falta la clave", () => {
    expect(() => validarSupabaseEnv(URL_OK, undefined)).toThrow(
      /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it("falla si la URL no es válida o no es https", () => {
    expect(() => validarSupabaseEnv("no-es-url", KEY_OK)).toThrow(
      /no es una URL válida/,
    );
    expect(() =>
      validarSupabaseEnv("http://abcdefgh.supabase.co", KEY_OK),
    ).toThrow(/https/);
  });

  it("rechaza la clave secreta en la variable pública", () => {
    expect(() => validarSupabaseEnv(URL_OK, "sb_secret_xyz")).toThrow(
      /SECRETA/,
    );
  });

  it.each([
    ["espacio de ancho cero", "https://abcd​efgh.supabase.co", "U+200B", 13],
    ["BOM al principio", "﻿https://abcdefgh.supabase.co", "U+FEFF", 1],
    ["a cirílica", "https://аbcdefgh.supabase.co", "U+0430", 9],
    ["espacio al final", `${URL_OK} `, "U+0020", URL_OK.length + 1],
    ["espacio no separable", `${URL_OK} `, "U+00A0", URL_OK.length + 1],
  ])("rechaza la URL con %s indicando carácter y posición", (_caso, url, codigo, pos) => {
    expect(() => validarSupabaseEnv(url, KEY_OK)).toThrow(
      `NEXT_PUBLIC_SUPABASE_URL tiene un carácter inválido (${codigo}) en la posición ${pos}.`,
    );
  });

  it("rechaza caracteres invisibles en la clave", () => {
    expect(() => validarSupabaseEnv(URL_OK, `${KEY_OK}\r`)).toThrow(
      /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY tiene un carácter inválido \(U\+000D\)/,
    );
  });

  it("rechaza claves con otro formato (p. ej. anon JWT viejo)", () => {
    expect(() => validarSupabaseEnv(URL_OK, "eyJhbGciOiJIUzI1NiJ9.x.y")).toThrow(
      /sb_publishable_/,
    );
  });
});

describe("validarSecretKey", () => {
  it("acepta sb_secret_", () => {
    expect(validarSecretKey("sb_secret_abc")).toBe("sb_secret_abc");
  });

  it("falla si falta, si es la publishable o si tiene caracteres raros", () => {
    expect(() => validarSecretKey(undefined)).toThrow(/Falta SUPABASE_SECRET_KEY/);
    expect(() => validarSecretKey("sb_publishable_abc")).toThrow(/sb_secret_/);
    expect(() => validarSecretKey("sb_secret_abc\r")).toThrow(/U\+000D/);
  });
});

describe("validarSecreto", () => {
  const OK = "a".repeat(24);

  it("acepta 24 caracteres o más", () => {
    expect(validarSecreto("WEBHOOK_CLAVE", OK)).toBe(OK);
  });

  it("falla si falta, si es corta o si tiene caracteres invisibles", () => {
    expect(() => validarSecreto("WEBHOOK_CLAVE", undefined)).toThrow(/Falta WEBHOOK_CLAVE/);
    expect(() => validarSecreto("WEBHOOK_CLAVE", "corta")).toThrow(/mínimo 24/);
    expect(() => validarSecreto("CRON_SECRET", `${OK} `)).toThrow(/CRON_SECRET tiene un carácter inválido \(U\+0020\)/);
  });
});
