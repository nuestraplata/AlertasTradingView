import { describe, expect, it } from "vitest";
import { restriccionDe, traducirErrorDb, valorEnConflicto } from "./errores";

// Mensajes reales de Postgres, tal como los devuelve Supabase.
const byma = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "tickers_ticker_byma_key"',
  details: "Key (ticker_byma)=(AAPL) already exists.",
};
const usaDuplicado = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "tickers_pkey"',
  details: "Key (ticker_usa)=(MELI) already exists.",
};
const tickerEnUso = {
  code: "23503",
  message:
    'update or delete on table "tickers" violates RESTRICT setting of foreign key constraint "activos_ticker_usa_fkey" on table "activos"',
  details: 'Key (ticker_usa)=(AAPL) is referenced from table "activos".',
};

describe("restriccionDe / valorEnConflicto", () => {
  it("extrae restricción y valor", () => {
    expect(restriccionDe(byma)).toBe("tickers_ticker_byma_key");
    expect(valorEnConflicto(byma)).toBe("AAPL");
    expect(restriccionDe(tickerEnUso)).toBe("activos_ticker_usa_fkey");
  });

  it("null si no hay datos", () => {
    expect(restriccionDe({})).toBeNull();
    expect(valorEnConflicto({ details: null })).toBeNull();
  });
});

describe("traducirErrorDb", () => {
  it("CEDEAR repetido, con el valor", () => {
    expect(traducirErrorDb(byma)).toBe("El CEDEAR AAPL ya está asignado a otro ticker USA.");
  });

  it("ticker USA repetido", () => {
    expect(traducirErrorDb(usaDuplicado)).toBe("El ticker USA MELI ya está cargado.");
  });

  it("sin details no deja espacios dobles", () => {
    expect(traducirErrorDb({ ...byma, details: null })).toBe(
      "El CEDEAR ya está asignado a otro ticker USA.",
    );
  });

  it("ticker en uso", () => {
    expect(traducirErrorDb(tickerEnUso)).toMatch(/se usa en alguna lista/);
  });

  it("reglas de activos", () => {
    expect(
      traducirErrorDb({
        code: "23514",
        message:
          'new row for relation "activos" violates check constraint "activos_tilde_segun_estrategia"',
      }),
    ).toBe("El tilde no corresponde a esta lista.");
    expect(
      traducirErrorDb({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "activos_ticker_estrategia_unico"',
      }),
    ).toBe("Ese ticker ya está en esta lista.");
  });

  it("restricción desconocida → mensaje por código", () => {
    expect(
      traducirErrorDb({ code: "23505", message: 'violates unique constraint "otra"' }),
    ).toBe("Ya existe un registro con esos datos.");
    expect(traducirErrorDb({ code: "42501", message: "permission denied" })).toMatch(
      /Sin permiso/,
    );
  });

  it("cualquier otro error → genérico, sin mostrar detalles internos", () => {
    expect(traducirErrorDb({ code: "XX000", message: "internal" })).toBe(
      "Error inesperado al guardar. Probá de nuevo.",
    );
    expect(traducirErrorDb({})).toBe("Error inesperado al guardar. Probá de nuevo.");
  });
});
