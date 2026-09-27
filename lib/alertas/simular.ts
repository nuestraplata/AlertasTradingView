// Arma el mensaje de "simular alerta" (sin la clave: la agrega el servidor).
// Después pasa por procesarAlerta igual que una alerta real de TradingView.

export type Simulacion =
  | {
      modo: "simple";
      estrategia: string;
      accion: string;
      ticker: string;
      precio: string;
    }
  | {
      modo: "json";
      /** Mensaje tal cual está en TradingView (puede traer placeholders). */
      json: string;
      /** Valores para {{ticker}} y {{close}}. */
      ticker: string;
      precio: string;
    };

export type ResultadoSimulacion =
  | { ok: true; mensaje: Record<string, unknown> }
  | { ok: false; error: string };

/** "2026-09-27T14:03:05Z": el formato de {{timenow}} de TradingView. */
export function horaComoTradingView(ahora: Date): string {
  return ahora.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Reemplaza los placeholders de TradingView que se pueden simular. */
export function reemplazarPlaceholders(
  texto: string,
  valores: { ticker: string; precio: string; hora: string },
): string {
  return texto
    .replaceAll("{{ticker}}", valores.ticker)
    .replaceAll("{{close}}", valores.precio)
    .replaceAll("{{timenow}}", valores.hora);
}

export function armarSimulacion(s: Simulacion, ahora: Date = new Date()): ResultadoSimulacion {
  const hora = horaComoTradingView(ahora);

  if (s.modo === "simple") {
    return {
      ok: true,
      mensaje: {
        estrategia: s.estrategia,
        accion: s.accion,
        ticker: s.ticker,
        precio: s.precio,
        hora,
      },
    };
  }

  if (s.json.trim() === "") return { ok: false, error: "Pegá el mensaje de la alerta." };
  // Los valores van dentro de strings JSON: se escapan para no romper el JSON.
  const escapar = (v: string) => JSON.stringify(v).slice(1, -1);
  const texto = reemplazarPlaceholders(s.json, {
    ticker: escapar(s.ticker.trim()),
    precio: escapar(s.precio.trim()),
    hora,
  });

  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch (e) {
    const detalle = e instanceof Error ? e.message : "";
    return {
      ok: false,
      error:
        `No es JSON válido${detalle ? ` (${detalle})` : ""}. ` +
        "TradingView lo mandaría como texto y el webhook lo rechazaría como \"mensaje ilegible\".",
    };
  }
  if (typeof datos !== "object" || datos === null || Array.isArray(datos)) {
    return { ok: false, error: "El mensaje tiene que ser un objeto JSON: { ... }." };
  }
  return { ok: true, mensaje: datos as Record<string, unknown> };
}
