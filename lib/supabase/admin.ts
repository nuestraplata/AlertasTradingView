import "server-only";

import { createClient } from "@supabase/supabase-js";
import { supabaseEnv, validarSecretKey } from "./env";

/**
 * Cliente con la clave SECRETA (rol service_role: saltea RLS). Solo para
 * el servidor, en rutas sin sesión de usuario: webhook y "simular alerta".
 * "server-only" hace fallar el build si se importa desde el navegador.
 */
export function createAdminClient() {
  const { url } = supabaseEnv();
  const secretKey = validarSecretKey(process.env.SUPABASE_SECRET_KEY);
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
