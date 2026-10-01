"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { RUTA_LOGIN } from "@/lib/auth/rutas";
import { clienteConSesion } from "@/lib/auth/sesion";
import { traducirErrorDb } from "@/lib/db/errores";
import { createClient } from "@/lib/supabase/server";

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(RUTA_LOGIN);
}

/**
 * Interruptor "Envío a EasyTrading" (visible en todas las pantallas).
 * En pausa las alertas se siguen guardando, descartadas con motivo
 * "pausado", y EasyTrading no recibe ni puede tomar señales.
 */
export async function cambiarEnvio(
  activar: boolean,
): Promise<{ ok: true; activado: boolean } | { ok: false; error: string }> {
  const { supabase } = await clienteConSesion();
  if (typeof activar !== "boolean") return { ok: false, error: "Datos inválidos." };

  const { data, error } = await supabase
    .from("configuracion")
    .update({ envio_activado: activar, envio_cambiado_en: new Date().toISOString() })
    .eq("id", 1)
    .select("envio_activado");
  if (error) {
    console.error("[envío] cambiar", error.code, error.message);
    return { ok: false, error: traducirErrorDb(error) };
  }
  if (!data.length) return { ok: false, error: "Falta la configuración (migración 4)." };

  // El interruptor está en el layout: se refrescan todas las pantallas.
  revalidatePath("/", "layout");
  return { ok: true, activado: activar };
}
