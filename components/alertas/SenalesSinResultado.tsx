import { NOMBRE_ESTRATEGIA, type Estrategia } from "@/lib/activos/schema";
import { formatearMomentoAR } from "@/lib/fechas";
import { DEMORA_PREOCUPANTE_MS, haceCuanto } from "@/lib/senales/estado";

export type TomadaFila = {
  id: number;
  alerta_id: number;
  ticker_byma: string;
  estrategia: Estrategia;
  accion: "compra" | "venta";
  origen: "tradingview" | "simulada";
  tomada_en: string;
};

export const COLUMNAS_TOMADA = "id, alerta_id, ticker_byma, estrategia, accion, origen, tomada_en";

/**
 * Señales que EasyTrading tomó y todavía no informó qué hizo. Si alguna
 * lleva varios minutos, EasyTrading pudo caerse después de tomarla: hay
 * que revisar en EasyTrading / el broker si la orden salió o no.
 */
export function SenalesSinResultado({ senales, ahora }: { senales: TomadaFila[]; ahora: Date }) {
  if (senales.length === 0) return null;
  const hayDemoradas = senales.some(
    (s) => ahora.getTime() - new Date(s.tomada_en).getTime() > DEMORA_PREOCUPANTE_MS,
  );

  return (
    <section
      id="sin-resultado"
      className={`rounded border p-3 text-sm ${
        hayDemoradas ? "border-red-600/50 bg-red-600/10" : "border-sky-600/40 bg-sky-600/10"
      }`}
    >
      <h2 className="font-medium">
        {hayDemoradas ? "⚠ " : ""}Señales tomadas por EasyTrading sin resultado: {senales.length}
      </h2>
      {hayDemoradas && (
        <p className="mt-1 text-xs">
          Si pasan más de 2 minutos, EasyTrading pudo caerse después de tomarlas: revisá en EasyTrading o
          en el broker si la orden salió.
        </p>
      )}
      <ul className="mt-2 flex flex-col gap-1 text-xs">
        {senales.map((s) => (
          <li key={s.id} className="flex flex-wrap gap-x-3">
            <span className="font-mono">#{s.id}</span>
            <span className="font-mono font-medium">{s.ticker_byma}</span>
            <span>
              {s.accion === "compra" ? "Compra" : "Venta"} · {NOMBRE_ESTRATEGIA[s.estrategia]}
              {s.origen === "simulada" ? " · simulada" : ""}
            </span>
            <span>
              tomada {formatearMomentoAR(s.tomada_en, ahora)}, <strong>sin resultado hace {haceCuanto(s.tomada_en, ahora)}</strong>
            </span>
            <span className="opacity-60">alerta #{s.alerta_id}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
