/** Forma mínima de un error de Supabase/PostgREST. */
export type ErrorDb = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

/**
 * Mensajes por nombre de restricción (ver la migración de tickers y
 * activos). Algunos usan el valor en conflicto, sacado de `details`.
 */
const sp = (v: string | null) => (v ? ` ${v}` : "");

const POR_RESTRICCION: Record<string, (valor: string | null) => string> = {
  tickers_pkey: (v) => `El ticker USA${sp(v)} ya está cargado.`,
  tickers_ticker_byma_key: (v) => `El CEDEAR${sp(v)} ya está asignado a otro ticker USA.`,
  tickers_ticker_usa_check: () =>
    "Ticker USA inválido: letras, números, punto o guion (máx. 15).",
  tickers_ticker_byma_check: () =>
    "Ticker BYMA inválido: solo letras y números, sin sufijo (máx. 10).",
  activos_ticker_usa_fkey: () =>
    "El ticker se usa en alguna lista (corto o intradía), o no existe en Tickers.",
  activos_ticker_estrategia_unico: () => "Ese ticker ya está en esta lista.",
  activos_tilde_segun_estrategia: () => "El tilde no corresponde a esta lista.",
  feriados_pkey: (v) => `Ya hay un feriado cargado${v ? ` el ${v}` : " ese día"}.`,
  configuracion_horario_valido: () => "El cierre tiene que ser después de la apertura.",
};

/** Nombre de la restricción que aparece entre comillas en el mensaje de Postgres. */
export function restriccionDe(error: ErrorDb): string | null {
  const m = error.message?.match(/constraint "([^"]+)"/);
  return m ? m[1] : null;
}

/** Valor en conflicto: 'Key (ticker_byma)=(AAPL) already exists.' → "AAPL". */
export function valorEnConflicto(error: ErrorDb): string | null {
  const m = error.details?.match(/\)=\(([^)]*)\)/);
  return m ? m[1] : null;
}

/** Traduce un error de la base a un mensaje entendible para el panel. */
export function traducirErrorDb(error: ErrorDb): string {
  const restriccion = restriccionDe(error);
  if (restriccion && POR_RESTRICCION[restriccion]) {
    return POR_RESTRICCION[restriccion](valorEnConflicto(error));
  }

  switch (error.code) {
    case "23505":
      return "Ya existe un registro con esos datos.";
    case "23503":
      return "No se puede: hay datos relacionados que lo usan.";
    case "23514":
      return "Algún valor no cumple las reglas de la base.";
    case "42501":
      return "Sin permiso. Probá salir y volver a entrar.";
    case "PGRST301":
    case "PGRST303":
      return "La sesión venció. Volvé a entrar.";
  }
  return "Error inesperado al guardar. Probá de nuevo.";
}
