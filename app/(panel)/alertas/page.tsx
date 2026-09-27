import type { Metadata } from "next";
import Link from "next/link";
import { BotonActualizar } from "@/components/alertas/BotonActualizar";
import { Filtros } from "@/components/alertas/Filtros";
import { IntentosRechazados, type IntentoFila } from "@/components/alertas/IntentosRechazados";
import { COLUMNAS_ALERTA, ListaAlertas, type AlertaFila } from "@/components/alertas/ListaAlertas";
import { LIMITE_MAX, PASO, hayFiltros, leerFiltros, urlAlertas } from "@/lib/alertas/filtros";
import { clienteConSesion } from "@/lib/auth/sesion";
import { traducirErrorDb } from "@/lib/db/errores";

export const metadata: Metadata = { title: "Alertas · Alertas TradingView" };

export default async function AlertasPage({ searchParams }: PageProps<"/alertas">) {
  const filtros = leerFiltros(await searchParams);
  const { supabase } = await clienteConSesion();
  const ahora = new Date();

  let consulta = supabase
    .from("alertas")
    .select(COLUMNAS_ALERTA, { count: "exact" })
    .order("id", { ascending: false })
    .limit(filtros.limite);
  if (filtros.estrategia) consulta = consulta.eq("estrategia", filtros.estrategia);
  if (filtros.accion) consulta = consulta.eq("accion", filtros.accion);
  if (filtros.estado) consulta = consulta.eq("estado", filtros.estado);
  if (filtros.origen) consulta = consulta.eq("origen", filtros.origen);

  const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [alertas, intentos] = await Promise.all([
    consulta,
    supabase
      .from("intentos_rechazados")
      .select("id, recibido_en, ip, motivo")
      .gte("recibido_en", hace24h)
      .order("id", { ascending: false })
      .limit(50),
  ]);

  const error = alertas.error ?? intentos.error;
  if (error) {
    console.error("[alertas] carga", error);
    return <p role="alert">❌ No se pudieron cargar las alertas: {traducirErrorDb(error)}</p>;
  }

  const filas = (alertas.data ?? []) as AlertaFila[];
  const total = alertas.count ?? filas.length;
  const hayMas = filas.length < total && filtros.limite < LIMITE_MAX;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Alertas</h1>
        <BotonActualizar />
      </div>

      {/* Se saca en F3, cuando el filtro de señales esté activo. */}
      <p className="rounded border border-sky-600/40 bg-sky-600/10 px-3 py-2 text-sm">
        F2: las alertas solo se registran; todavía no se generan señales.
      </p>

      <Filtros filtros={filtros} />

      <p className="text-xs opacity-60">
        {total === 0
          ? "Sin alertas."
          : `Mostrando ${filas.length} de ${total} (las más recientes primero).`}
      </p>

      {filas.length === 0 ? (
        <p className="text-sm opacity-70">
          {hayFiltros(filtros) ? (
            <>
              No hay alertas con estos filtros.{" "}
              <Link href="/alertas" className="underline">
                Ver todas
              </Link>
              .
            </>
          ) : (
            "Todavía no llegó ninguna alerta. Cuando TradingView (o una prueba) mande una, aparece acá."
          )}
        </p>
      ) : (
        <ListaAlertas alertas={filas} ahora={ahora} />
      )}

      {hayMas && (
        <Link
          href={urlAlertas(filtros, { limite: filtros.limite + PASO })}
          scroll={false}
          className="self-center rounded border border-current/30 px-4 py-1.5 text-sm hover:bg-current/10"
        >
          Ver más
        </Link>
      )}
      {filas.length < total && !hayMas && (
        <p className="self-center text-xs opacity-60">
          Se muestran hasta {LIMITE_MAX}. Usá los filtros para encontrar alertas más viejas.
        </p>
      )}

      <IntentosRechazados intentos={(intentos.data ?? []) as IntentoFila[]} ahora={ahora} />
    </div>
  );
}
