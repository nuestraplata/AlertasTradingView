import Link from "next/link";
import { FormActivo } from "@/components/activos/FormActivo";
import { NOMBRE_ESTRATEGIA } from "@/lib/activos/schema";
import { clienteConSesion } from "@/lib/auth/sesion";
import { traducirErrorDb } from "@/lib/db/errores";
import { estrategiaDeRuta } from "../estrategia";

export default async function NuevoActivoPage({ params }: PageProps<"/[estrategia]/nuevo">) {
  const estrategia = estrategiaDeRuta((await params).estrategia);
  const { supabase } = await clienteConSesion();

  const [tickers, enLista] = await Promise.all([
    supabase.from("tickers").select("ticker_usa, ticker_byma").order("ticker_usa"),
    supabase.from("activos").select("ticker_usa").eq("estrategia", estrategia),
  ]);
  const error = tickers.error ?? enLista.error;
  if (error) {
    console.error("[activos] nuevo", error);
    return <p role="alert">❌ No se pudieron cargar los tickers: {traducirErrorDb(error)}</p>;
  }

  const usados = new Set((enLista.data ?? []).map((a) => a.ticker_usa as string));
  const opciones = (tickers.data ?? []).map((t) => ({
    ticker_usa: t.ticker_usa as string,
    ticker_byma: t.ticker_byma as string,
    enLista: usados.has(t.ticker_usa as string),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/${estrategia}`} className="text-sm opacity-70 hover:underline">
          ← {NOMBRE_ESTRATEGIA[estrategia]}
        </Link>
        <h1 className="text-xl font-semibold">Agregar a {NOMBRE_ESTRATEGIA[estrategia]}</h1>
      </div>
      {opciones.length === 0 ? (
        <p className="text-sm opacity-70">
          No hay tickers. Primero cargalos en{" "}
          <Link href="/tickers" className="underline">
            Tickers
          </Link>
          .
        </p>
      ) : (
        <FormActivo estrategia={estrategia} tickers={opciones} />
      )}
    </div>
  );
}
