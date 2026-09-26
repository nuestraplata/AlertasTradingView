import { redirect } from "next/navigation";
import { RUTA_LOGIN } from "@/lib/auth/rutas";
import { createClient } from "@/lib/supabase/server";
import { cerrarSesion } from "./actions";

/**
 * Layout de todas las páginas del panel. Verifica la sesión además del
 * proxy (defensa en profundidad: si el matcher cambia, esto sigue cuidando).
 */
export default async function PanelLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(RUTA_LOGIN);

  const email = typeof data.claims.email === "string" ? data.claims.email : "";

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-current/15 px-6 py-3 text-sm">
        <span className="font-semibold">Alertas TradingView</span>
        <div className="flex items-center gap-3">
          <span className="opacity-70">{email}</span>
          <form action={cerrarSesion}>
            <button
              type="submit"
              className="rounded border border-current/30 px-2 py-1 hover:bg-current/10"
            >
              Salir
            </button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}
