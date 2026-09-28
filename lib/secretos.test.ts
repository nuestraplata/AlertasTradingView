import { describe, expect, it } from "vitest";
import { secretoCorrecto } from "./secretos";

describe("secretoCorrecto", () => {
  it("true solo si es exactamente igual", () => {
    expect(secretoCorrecto("abc123", "abc123")).toBe(true);
    expect(secretoCorrecto("abc124", "abc123")).toBe(false);
    expect(secretoCorrecto("ABC123", "abc123")).toBe(false);
    expect(secretoCorrecto("abc123 ", "abc123")).toBe(false);
    expect(secretoCorrecto("abc12", "abc123")).toBe(false);
  });

  it("vacíos, null o de otro tipo → false", () => {
    expect(secretoCorrecto("", "")).toBe(false);
    expect(secretoCorrecto("x", "")).toBe(false);
    expect(secretoCorrecto(undefined, "x")).toBe(false);
    expect(secretoCorrecto(null, "x")).toBe(false);
    expect(secretoCorrecto(123, "123")).toBe(false);
  });
});
