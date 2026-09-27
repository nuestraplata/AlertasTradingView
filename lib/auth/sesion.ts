import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RUTA_LOGIN } from "./rutas";

/**
 * Cliente de Supabase con sesión verificada. Si no hay sesión, redirige a
 * /login. Usarlo en cada layout y en cada Server Action del panel: no
 * alcanza con el proxy (una acción puede llamarse directo por POST).
 */
export async function clienteConSesion() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(RUTA_LOGIN);
  return { supabase, claims: data.claims };
}
