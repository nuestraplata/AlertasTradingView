"use server";

import { redirect } from "next/navigation";
import { RUTA_LOGIN } from "@/lib/auth/rutas";
import { createClient } from "@/lib/supabase/server";

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(RUTA_LOGIN);
}
