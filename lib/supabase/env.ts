export type SupabaseEnv = { url: string; publishableKey: string };

/**
 * Valida la URL y la clave pública de Supabase. Falla con un mensaje claro
 * si faltan, tienen mal formato o si por error se cargó la clave secreta
 * en la variable pública (quedaría expuesta en el navegador).
 */
export function validarSupabaseEnv(
  url: string | undefined,
  publishableKey: string | undefined,
): SupabaseEnv {
  if (!url) {
    throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL (ver .env.example).");
  }
  if (!publishableKey) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ver .env.example).",
    );
  }

  verificarCaracteres("NEXT_PUBLIC_SUPABASE_URL", url);
  verificarCaracteres("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publishableKey);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL no es una URL válida.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL tiene que empezar con https://");
  }

  if (publishableKey.startsWith("sb_secret_")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY tiene la clave SECRETA. " +
        "Poné la publishable (sb_publishable_...) y rotá la secreta en Supabase.",
    );
  }
  if (!publishableKey.startsWith("sb_publishable_")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY tiene que empezar con sb_publishable_",
    );
  }

  return { url: parsed.origin, publishableKey };
}

/**
 * Solo ASCII visible (sin espacios). Detecta lo que se cuela al copiar y
 * pegar: espacios, BOM, espacios de ancho cero, letras parecidas de otros
 * alfabetos (p. ej. "а" cirílica). new URL() los acepta y después el DNS falla
 * con un "fetch failed" que no dice nada.
 */
function verificarCaracteres(variable: string, valor: string) {
  const i = [...valor].findIndex((c) => !/^[\x21-\x7e]$/.test(c));
  if (i === -1) return;
  const c = [...valor][i];
  const codigo = `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
  throw new Error(
    `${variable} tiene un carácter inválido (${codigo}) en la posición ${i + 1}. ` +
      "Escribila de nuevo a mano en .env.local.",
  );
}

export function supabaseEnv(): SupabaseEnv {
  // Referencias literales: Next.js solo reemplaza process.env.NEXT_PUBLIC_*
  // escritas así en el código que va al navegador.
  return validarSupabaseEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
