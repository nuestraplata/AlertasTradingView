"use server";

import { revalidatePath } from "next/cache";
import { feriadoSchema, horarioSchema } from "@/lib/configuracion/schema";
import { clienteConSesion } from "@/lib/auth/sesion";
import { traducirErrorDb } from "@/lib/db/errores";
import { erroresPorCampo } from "@/lib/validacion";

export type EstadoForm =
  | { ok: true; mensaje: string }
  | { ok: false; error: string; campos?: Record<string, string>; valores?: Record<string, string> }
  | undefined;

/** Horario de mercado (hora de Argentina) que usa el filtro de señales. */
export async function guardarHorario(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { supabase } = await clienteConSesion();

  const valores = {
    hora_apertura: String(formData.get("hora_apertura") ?? ""),
    hora_cierre: String(formData.get("hora_cierre") ?? ""),
  };
  const r = horarioSchema.safeParse(valores);
  if (!r.success) {
    return { ok: false, error: "Revisá el horario.", campos: erroresPorCampo(r.error), valores };
  }

  const { data, error } = await supabase
    .from("configuracion")
    .update({ ...r.data, horario_cambiado_en: new Date().toISOString() })
    .eq("id", 1)
    .select("id");
  if (error) {
    console.error("[configuración] horario", error.code, error.message);
    return { ok: false, error: traducirErrorDb(error), valores };
  }
  if (!data.length) return { ok: false, error: "Falta la configuración (migración 4).", valores };

  revalidatePath("/configuracion");
  return { ok: true, mensaje: `Horario guardado: de ${r.data.hora_apertura} a ${r.data.hora_cierre}.` };
}

export async function agregarFeriado(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { supabase } = await clienteConSesion();

  const valores = {
    fecha: String(formData.get("fecha") ?? ""),
    descripcion: String(formData.get("descripcion") ?? ""),
  };
  const r = feriadoSchema.safeParse(valores);
  if (!r.success) {
    return { ok: false, error: "Revisá el feriado.", campos: erroresPorCampo(r.error), valores };
  }

  const { error } = await supabase.from("feriados").insert(r.data);
  if (error) {
    console.error("[configuración] feriado", error.code, error.message);
    return { ok: false, error: traducirErrorDb(error), valores };
  }

  revalidatePath("/configuracion");
  return { ok: true, mensaje: `Feriado ${r.data.fecha} agregado.` };
}

export async function borrarFeriado(fecha: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase } = await clienteConSesion();
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: "Fecha inválida." };
  }

  const { data, error } = await supabase.from("feriados").delete().eq("fecha", fecha).select("fecha");
  if (error) {
    console.error("[configuración] borrar feriado", error.code, error.message);
    return { ok: false, error: traducirErrorDb(error) };
  }
  if (!data.length) return { ok: false, error: "Ese feriado ya no existe." };

  revalidatePath("/configuracion");
  return { ok: true };
}
