import { describe, expect, it } from "vitest";
import { validarSupabaseEnv } from "./env";

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

  it("rechaza claves con otro formato (p. ej. anon JWT viejo)", () => {
    expect(() => validarSupabaseEnv(URL_OK, "eyJhbGciOiJIUzI1NiJ9.x.y")).toThrow(
      /sb_publishable_/,
    );
  });
});
