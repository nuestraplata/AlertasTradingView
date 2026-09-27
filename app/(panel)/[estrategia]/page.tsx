import type { Metadata } from "next";
import Link from "next/link";
import { ListaActivos } from "@/components/activos/ListaActivos";
import { COLUMNAS_ACTIVO, type ActivoFila } from "@/lib/activos/fila";
import { NOMBRE_ESTRATEGIA } from "@/lib/activos/schema";
import { clienteConSesion } from "@/lib/auth/sesion";
import { traducirErrorDb } from "@/lib/db/errores";
import { estrategiaDeRuta } from "./estrategia";

export async function generateMetadata({
  params,
}: PageProps<"/[estrategia]">): Promise<Metadata> {
  const { estrategia } = await params;
  const nombre = NOMBRE_ESTRATEGIA[estrategia as keyof typeof NOMBRE_ESTRATEGIA];
  return { title: `${nombre ?? "Lista"} · Alertas TradingView` };
}

export default async function ListaPage({ params }: PageProps<"/[estrategia]">) {
  const estrategia = estrategiaDeRuta((await params).estrategia);
  const { supabase } = await clienteConSesion();

  const [activos, tickers] = await Promise.all([
    supabase
      .from("activos")
      .select(COLUMNAS_ACTIVO)
      .eq("estrategia", estrategia)
      .order("ticker_usa"),
    supabase.from("tickers").select("ticker_usa", { count: "exact", head: true }),
  ]);

  const error = activos.error ?? tickers.error;
  if (error) {
    console.error("[activos] carga", error);
    return <p role="alert">❌ No se pudo cargar la lista: {traducirErrorDb(error)}</p>;
  }

  const filas = (activos.data ?? []) as unknown as ActivoFila[];
  const hayTickers = (tickers.count ?? 0) > 0;
  const nombre = NOMBRE_ESTRATEGIA[estrategia];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{nombre}</h1>
        {hayTickers && (
          <Link
            href={`/${estrategia}/nuevo`}
            className="rounded bg-foreground px-3 py-1.5 text-sm text-background"
          >
            + Agregar
          </Link>
        )}
      </div>

      {filas.length === 0 ? (
        <p className="text-sm opacity-70">
          {hayTickers ? (
            <>
              Todavía no hay activos en {nombre}.{" "}
              <Link href={`/${estrategia}/nuevo`} className="underline">
                Agregá el primero
              </Link>
              .
            </>
          ) : (
            <>
              Todavía no hay tickers. Primero cargalos en{" "}
              <Link href="/tickers" className="underline">
                Tickers
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <ListaActivos filas={filas} estrategia={estrategia} />
      )}
    </div>
  );
}
