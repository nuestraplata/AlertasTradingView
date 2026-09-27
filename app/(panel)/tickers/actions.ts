"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { tickerSchema, tickerUsa, type Estrategia } from "@/lib/activos/schema";
import { clienteConSesion } from "@/lib/auth/sesion";
import { restriccionDe, traducirErrorDb, valorEnConflicto, type ErrorDb } from "@/lib/db/errores";
import { nombresListas, usosPorTicker } from "@/lib/tickers/usos";
import { erroresPorCampo } from "@/lib/validacion";

export type EstadoTicker =
  | { ok: true; mensaje: string }
  | {
      ok: false;
      error: string;
      campos?: Record<string, string>;
      valores?: { ticker_usa: string; ticker_byma: string };
    }
  | undefined;

const RUTA = "/tickers";

function leer(formData: FormData) {
  return {
    ticker_usa: String(formData.get("ticker_usa") ?? ""),
    ticker_byma: String(formData.get("ticker_byma") ?? ""),
  };
}

export async function crearTicker(_prev: EstadoTicker, formData: FormData): Promise<EstadoTicker> {
  const { supabase } = await clienteConSesion();
  const valores = leer(formData);

  const r = tickerSchema.safeParse(valores);
  if (!r.success) {
    return { ok: false, error: "Revisá los campos.", campos: erroresPorCampo(r.error), valores };
  }

  const { error } = await supabase.from("tickers").insert(r.data);
  if (error) return { ok: false, error: await mensajeError(supabase, error), valores };

  revalidatePath(RUTA);
  return { ok: true, mensaje: `${r.data.ticker_usa} → ${r.data.ticker_byma} agregado.` };
}

export async function editarTicker(_prev: EstadoTicker, formData: FormData): Promise<EstadoTicker> {
  const { supabase } = await clienteConSesion();
  const valores = leer(formData);

  const original = tickerUsa.safeParse(formData.get("original"));
  if (!original.success) return { ok: false, error: "Ticker original inválido.", valores };

  const r = tickerSchema.safeParse(valores);
  if (!r.success) {
    return { ok: false, error: "Revisá los campos.", campos: erroresPorCampo(r.error), valores };
  }

  const { data, error } = await supabase
    .from("tickers")
    .update(r.data)
    .eq("ticker_usa", original.data)
    .select("ticker_usa");
  if (error) return { ok: false, error: await mensajeError(supabase, error), valores };
  if (!data.length) {
    return { ok: false, error: `${original.data} ya no existe (¿se borró en otra pestaña?).`, valores };
  }

  revalidatePath(RUTA);
  const renombrado = r.data.ticker_usa !== original.data;
  return {
    ok: true,
    mensaje: renombrado
      ? `${original.data} ahora es ${r.data.ticker_usa}. Acordate de que las alertas de TradingView usen ${r.data.ticker_usa}.`
      : `${r.data.ticker_usa} → ${r.data.ticker_byma} guardado.`,
  };
}

export async function borrarTicker(_prev: EstadoTicker, formData: FormData): Promise<EstadoTicker> {
  const { supabase } = await clienteConSesion();

  const t = tickerUsa.safeParse(formData.get("ticker_usa"));
  if (!t.success) return { ok: false, error: "Ticker inválido." };

  const { data, error } = await supabase
    .from("tickers")
    .delete()
    .eq("ticker_usa", t.data)
    .select("ticker_usa");
  if (error) return { ok: false, error: await mensajeError(supabase, error) };
  if (!data.length) return { ok: false, error: `${t.data} ya no existe.` };

  revalidatePath(RUTA);
  return { ok: true, mensaje: `${t.data} borrado.` };
}

/** Traduce el error y, en los casos comunes, lo completa con datos reales. */
async function mensajeError(supabase: SupabaseClient, error: ErrorDb): Promise<string> {
  console.error("[tickers]", error.code, error.message, error.details);
  const restriccion = restriccionDe(error);
  const valor = valorEnConflicto(error);

  if (restriccion === "tickers_ticker_byma_key" && valor) {
    const { data } = await supabase
      .from("tickers")
      .select("ticker_usa")
      .eq("ticker_byma", valor)
      .maybeSingle();
    if (data) return `El CEDEAR ${valor} ya está asignado a ${data.ticker_usa}.`;
  }

  if (restriccion === "activos_ticker_usa_fkey" && valor) {
    const { data } = await supabase
      .from("activos")
      .select("ticker_usa, estrategia")
      .eq("ticker_usa", valor);
    const listas = usosPorTicker((data ?? []) as { ticker_usa: string; estrategia: Estrategia }[]);
    if (listas[valor]?.length) {
      return `${valor} se usa en ${nombresListas(listas[valor])}. Sacalo de ahí primero.`;
    }
  }

  return traducirErrorDb(error);
}
