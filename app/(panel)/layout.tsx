import { AvisosProvider } from "@/components/Avisos";
import { EnvioEasyTrading } from "@/components/EnvioEasyTrading";
import { Navegacion } from "@/components/Navegacion";
import { clienteConSesion } from "@/lib/auth/sesion";
import { formatearMomentoAR } from "@/lib/fechas";
import { conexionEasyTrading } from "@/lib/senales/estado";
import { cerrarSesion } from "./actions";

/**
 * Layout de todas las páginas del panel. Verifica la sesión además del
 * proxy (defensa en profundidad: si el matcher cambia, esto sigue cuidando).
 */
export default async function PanelLayout({ children }: LayoutProps<"/">) {
  const { supabase, claims } = await clienteConSesion();
  const email = typeof claims.email === "string" ? claims.email : "";

  // Interruptor de envío: en todas las pantallas.
  const { data: conf, error } = await supabase
    .from("configuracion")
    .select("envio_activado, envio_cambiado_en, easytrading_visto_en")
    .eq("id", 1)
    .maybeSingle();
  if (error) console.error("[layout] configuración", error.code, error.message);
  const ahora = new Date();

  return (
    <AvisosProvider>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-current/15 px-4 py-3 sm:px-6">
        <span className="font-semibold">Alertas TradingView</span>
        <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
          <Navegacion />
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm sm:ml-0">
          <span className="hidden opacity-70 md:inline">{email}</span>
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
      {conf ? (
        <EnvioEasyTrading
          activado={conf.envio_activado}
          cambiadoEn={formatearMomentoAR(conf.envio_cambiado_en, ahora)}
          conexion={conexionEasyTrading(conf.easytrading_visto_en, ahora)}
          vistoEn={conf.easytrading_visto_en ? formatearMomentoAR(conf.easytrading_visto_en, ahora) : null}
        />
      ) : (
        <p role="alert" className="border-b border-red-600/40 bg-red-600/10 px-4 py-2 text-sm sm:px-6">
          ❌ No se pudo leer el estado del envío a EasyTrading (¿falta correr la migración 4?).
        </p>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </AvisosProvider>
  );
}
