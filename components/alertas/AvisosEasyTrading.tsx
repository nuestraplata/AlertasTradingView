import { formatearMomentoAR } from "@/lib/fechas";

export type AvisoFila = {
  id: number;
  recibido_en: string;
  ticker_byma: string;
  ticker_usa: string | null;
  cerrada_en: string;
  senal_id: number | null;
  resultado: "destildado" | "ya_destildado" | "no_esta_en_la_lista" | "ticker_desconocido";
};

const RESULTADO: Record<AvisoFila["resultado"], string> = {
  destildado: "Se destildó “activo” en Corto plazo",
  ya_destildado: "Ya estaba destildado",
  no_esta_en_la_lista: "No está en la lista de Corto plazo",
  ticker_desconocido: "CEDEAR que no está en Tickers",
};

/**
 * Avisos de EasyTrading de posición de corto cerrada (últimos 7 días),
 * con lo que hizo la web (docs/ESPECIFICACION.md §8).
 */
export function AvisosEasyTrading({ avisos, ahora }: { avisos: AvisoFila[]; ahora: Date }) {
  return (
    <details className="rounded border border-current/15 p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Posiciones de corto cerradas (avisos de EasyTrading, últimos 7 días):{" "}
        <span className="opacity-60">{avisos.length}</span>
      </summary>
      {avisos.length === 0 ? (
        <p className="mt-2 text-xs opacity-60">Ninguno.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1 text-xs">
          {avisos.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-3">
              <span className="font-mono">{formatearMomentoAR(a.cerrada_en, ahora)}</span>
              <span className="font-mono font-medium">
                {a.ticker_byma}
                {a.ticker_usa && a.ticker_usa !== a.ticker_byma ? ` (${a.ticker_usa})` : ""}
              </span>
              <span>{RESULTADO[a.resultado] ?? a.resultado}</span>
              {a.senal_id !== null && <span className="opacity-60">señal #{a.senal_id}</span>}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
