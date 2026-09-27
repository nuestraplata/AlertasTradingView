import type { Metadata } from "next";
import type { Estrategia } from "@/lib/activos/schema";
import { clienteConSesion } from "@/lib/auth/sesion";
import { traducirErrorDb } from "@/lib/db/errores";
import { usosPorTicker } from "@/lib/tickers/usos";
import { FilaTicker } from "./FilaTicker";
import { FormNuevoTicker } from "./FormNuevoTicker";

export const metadata: Metadata = { title: "Tickers · Alertas TradingView" };

export default async function TickersPage() {
  const { supabase } = await clienteConSesion();
  const [tickers, activos] = await Promise.all([
    supabase.from("tickers").select("ticker_usa, ticker_byma").order("ticker_usa"),
    supabase.from("activos").select("ticker_usa, estrategia"),
  ]);

  const error = tickers.error ?? activos.error;
  if (error) {
    console.error("[tickers] carga", error);
    return <p role="alert">❌ No se pudieron cargar los tickers: {traducirErrorDb(error)}</p>;
  }

  const lista = tickers.data ?? [];
  const usos = usosPorTicker(
    (activos.data ?? []) as { ticker_usa: string; estrategia: Estrategia }[],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Tickers</h1>
        <p className="text-sm opacity-70">
          Mapeo del ticker de TradingView (USA) al CEDEAR que se opera en BYMA (ARS, 24hs).
        </p>
      </div>

      <FormNuevoTicker />

      {lista.length === 0 ? (
        <p className="text-sm opacity-70">
          Todavía no hay tickers. Cargá el primero arriba para poder armar las listas.
        </p>
      ) : (
        <div className="flex flex-col">
          <div className="hidden grid-cols-[8rem_8rem_1fr_auto] gap-3 border-b border-current/15 px-2 pb-2 text-xs font-medium uppercase opacity-60 sm:grid">
            <span>USA</span>
            <span>BYMA</span>
            <span>Usado en</span>
            <span className="sr-only">Acciones</span>
          </div>
          <ul>
            {lista.map((t) => (
              <FilaTicker
                key={t.ticker_usa}
                ticker={t}
                usos={usos[t.ticker_usa] ?? []}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
