type ConCampos = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  errno?: unknown;
  syscall?: unknown;
  hostname?: unknown;
  address?: unknown;
  port?: unknown;
  cause?: unknown;
  errors?: unknown;
};

const CAMPOS = ["code", "errno", "syscall", "hostname", "address", "port"] as const;

function describirUno(e: unknown): string {
  if (!(e instanceof Error) && (typeof e !== "object" || e === null)) {
    return String(e);
  }
  const err = e as ConCampos;
  const partes = [`${err.name ?? "Error"}: ${err.message ?? ""}`.trim()];
  const extras = CAMPOS.filter((k) => err[k] !== undefined).map(
    (k) => `${k}=${String(err[k])}`,
  );
  if (extras.length) partes.push(`(${extras.join(", ")})`);
  return partes.join(" ");
}

/**
 * Describe un error recorriendo toda la cadena de `cause` (y los `errors` de
 * un AggregateError). Sirve para ver el motivo real detrás de "fetch failed":
 * DNS (ENOTFOUND), timeout (UND_ERR_CONNECT_TIMEOUT), certificado, etc.
 */
export function describirError(e: unknown, maxProfundidad = 5): string {
  const lineas: string[] = [];
  let actual: unknown = e;
  for (let i = 0; actual !== undefined && actual !== null && i < maxProfundidad; i++) {
    lineas.push(i === 0 ? describirUno(actual) : `causa: ${describirUno(actual)}`);
    const errs = (actual as ConCampos).errors;
    if (Array.isArray(errs)) {
      errs.forEach((sub) => lineas.push(`  - ${describirUno(sub)}`));
    }
    actual = (actual as ConCampos).cause;
  }
  return lineas.join("\n");
}
