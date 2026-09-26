"use server";

import { redirect } from "next/navigation";
import { leerCredenciales } from "@/lib/auth/credenciales";
import { destinoSeguro } from "@/lib/auth/rutas";
import { createClient } from "@/lib/supabase/server";

export type EstadoLogin = { error: string } | undefined;

export async function iniciarSesion(
  _prev: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const cred = leerCredenciales(formData.get("email"), formData.get("password"));
  if (!cred.ok) return { error: cred.error };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(cred.datos);

  if (error) {
    console.error("[login]", error.code ?? error.status, error.message);
    if (error.code === "over_request_rate_limit") {
      return { error: "Demasiados intentos. Esperá unos minutos." };
    }
    // Mensaje genérico: no revelar si el email existe.
    return { error: "Email o contraseña incorrectos." };
  }

  // redirect() fuera de cualquier try/catch: funciona lanzando una excepción.
  redirect(destinoSeguro(formData.get("next")));
}
