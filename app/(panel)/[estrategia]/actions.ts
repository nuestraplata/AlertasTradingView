"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { filaParaGuardar } from "@/lib/activos/fila";
import { ESTRATEGIAS, NOMBRE_ESTRATEGIA, activoSchema, type Estrategia } from "@/lib/activos/schema";
import { clienteConSesion } from "@/lib/auth/sesion";
import { restriccionDe, traducirErrorDb, type ErrorDb } from "@/lib/db/errores";
import { erroresPorCampo } from "@/lib/validacion";

export type EstadoActivo =
  | { ok: true; mensaje: string }
  | { ok: false; error: string; campos?: Record<string, string>; valores?: Record<string, string> }
  | undefined;

const CAMPOS = [
  "ticker_usa",
  "nominales",
  "nominales_max",
  "entrada_usd",
  "tp_usd",
  "sl_usd",
  "onda",
  "sub_onda",
  "notas",
  "modo",
  "tildado",
] as const;

const estrategiaSchema = z.enum(ESTRATEGIAS);
const idSchema = z.coerce.number().int().positive();

/** Alta (sin id) o edición (con id) de un activo. */
export async function guardarActivo(_prev: EstadoActivo, formData: FormData): Promise<EstadoActivo> {
  const { supabase } = await clienteConSesion();

  const valores = Object.fromEntries(CAMPOS.map((c) => [c, String(formData.get(c) ?? "")]));
  // Un checkbox sin tildar no viene en el form.
  if (!formData.has("tildado")) valores.tildado = "";

  const estrategia = estrategiaSchema.safeParse(formData.get("estrategia"));
  if (!estrategia.success) return { ok: false, error: "Lista inválida.", valores };

  const idTexto = formData.get("id");
  const id = idTexto ? idSchema.safeParse(idTexto) : null;
  if (id && !id.success) return { ok: false, error: "Activo inválido.", valores };

  const r = activoSchema.safeParse({ ...valores, estrategia: estrategia.data });
  if (!r.success) {
    return { ok: false, error: "Revisá los campos marcados.", campos: erroresPorCampo(r.error), valores };
  }

  const fila = filaParaGuardar(r.data);
  const lista = NOMBRE_ESTRATEGIA[estrategia.data];

  if (id) {
    // El ticker y la lista no se cambian al editar.
    const ticker_usa = fila.ticker_usa;
    const cambios: Partial<typeof fila> = { ...fila };
    delete cambios.ticker_usa;
    delete cambios.estrategia;
    const { data, error } = await supabase
      .from("activos")
      .update(cambios)
      .eq("id", id.data)
      .eq("estrategia", estrategia.data)
      .select("id");
    if (error) return { ok: false, error: mensajeError(error, ticker_usa, estrategia.data), valores };
    if (!data.length) return { ok: false, error: "Ese activo ya no existe (¿se borró en otra pestaña?).", valores };
    revalidatePath(`/${estrategia.data}`);
    return { ok: true, mensaje: `${ticker_usa} guardado en ${lista}.` };
  }

  const { error } = await supabase.from("activos").insert(fila);
  if (error) return { ok: false, error: mensajeError(error, fila.ticker_usa, estrategia.data), valores };
  revalidatePath(`/${estrategia.data}`);
  revalidatePath("/tickers");
  return { ok: true, mensaje: `${fila.ticker_usa} agregado a ${lista}.` };
}

export async function borrarActivo(_prev: EstadoActivo, formData: FormData): Promise<EstadoActivo> {
  const { supabase } = await clienteConSesion();

  const estrategia = estrategiaSchema.safeParse(formData.get("estrategia"));
  const id = idSchema.safeParse(formData.get("id"));
  if (!estrategia.success || !id.success) return { ok: false, error: "Activo inválido." };

  const { data, error } = await supabase
    .from("activos")
    .delete()
    .eq("id", id.data)
    .eq("estrategia", estrategia.data)
    .select("ticker_usa");
  if (error) {
    console.error("[activos] borrar", error.code, error.message);
    return { ok: false, error: traducirErrorDb(error) };
  }
  if (!data.length) return { ok: false, error: "Ese activo ya no existe." };

  revalidatePath(`/${estrategia.data}`);
  revalidatePath("/tickers");
  return {
    ok: true,
    mensaje: `${data[0].ticker_usa} borrado de ${NOMBRE_ESTRATEGIA[estrategia.data]}.`,
  };
}

function mensajeError(error: ErrorDb, ticker: string, estrategia: Estrategia): string {
  console.error("[activos]", error.code, error.message, error.details);
  switch (restriccionDe(error)) {
    case "activos_ticker_estrategia_unico":
      return `${ticker} ya está en ${NOMBRE_ESTRATEGIA[estrategia]}.`;
    case "activos_ticker_usa_fkey":
      return `${ticker} no está en Tickers. Cargalo primero.`;
  }
  return traducirErrorDb(error);
}
