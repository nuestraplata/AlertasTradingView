import { formatearPrecio } from "@/lib/activos/fila";
import { NOMBRE_ESTRATEGIA, type Estrategia } from "@/lib/activos/schema";
import type { EstadoAlerta } from "@/lib/alertas/filtros";
import type { Accion, Origen } from "@/lib/alertas/procesar";
import { formatearMomentoAR } from "@/lib/fechas";

/** Fila de public.alertas tal como la pide la pantalla. */
export type AlertaFila = {
  id: number;
  recibida_en: string;
  origen: Origen;
  ticker: string | null;
  estrategia: Estrategia | null;
  accion: Accion | null;
  precio_usd: number | null;
  estado: EstadoAlerta;
  motivo: string | null;
  payload: Record<string, unknown>;
};

export const COLUMNAS_ALERTA =
  "id, recibida_en, origen, ticker, estrategia, accion, precio_usd, estado, motivo, payload";

function AccionTag({ accion }: { accion: Accion | null }) {
  if (!accion) return <span className="opacity-40">—</span>;
  return accion === "compra" ? (
    <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-xs font-semibold text-white">COMPRA</span>
  ) : (
    <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">VENTA</span>
  );
}

function EstadoTag({ estado }: { estado: EstadoAlerta }) {
  return estado === "recibida" ? (
    <span className="rounded bg-current/10 px-1.5 py-0.5 text-xs">Recibida</span>
  ) : (
    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
      Descartada
    </span>
  );
}

function OrigenTag({ origen }: { origen: Origen }) {
  return origen === "simulada" ? (
    <span className="rounded border border-dashed border-current/40 px-1.5 py-0.5 text-xs">Simulada</span>
  ) : null;
}

/** Mensaje original (sin la clave), plegado. */
function Mensaje({ payload }: { payload: Record<string, unknown> }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer opacity-60 hover:opacity-100">ver mensaje</summary>
      <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap break-all rounded bg-current/5 p-2 font-mono">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  );
}

export function ListaAlertas({ alertas, ahora }: { alertas: AlertaFila[]; ahora: Date }) {
  return (
    <>
      {/* Computadora: tabla */}
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b border-current/15 text-left text-xs uppercase opacity-60">
            <th className="px-2 py-2 font-medium">Hora (AR)</th>
            <th className="px-2 py-2 font-medium">Estrategia</th>
            <th className="px-2 py-2 font-medium">Acción</th>
            <th className="px-2 py-2 font-medium">Ticker</th>
            <th className="px-2 py-2 text-right font-medium">Precio USD</th>
            <th className="px-2 py-2 font-medium">Estado</th>
            <th className="px-2 py-2 font-medium">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {alertas.map((a) => (
            <tr key={a.id} className="border-b border-current/10 align-top">
              <td className="whitespace-nowrap px-2 py-2 font-mono">
                {formatearMomentoAR(a.recibida_en, ahora)}
                <div className="mt-1">
                  <OrigenTag origen={a.origen} />
                </div>
              </td>
              <td className="px-2 py-2">{a.estrategia ? NOMBRE_ESTRATEGIA[a.estrategia] : "—"}</td>
              <td className="px-2 py-2">
                <AccionTag accion={a.accion} />
              </td>
              <td className="px-2 py-2 font-mono font-medium">{a.ticker ?? "—"}</td>
              <td className="px-2 py-2 text-right font-mono">{formatearPrecio(a.precio_usd)}</td>
              <td className="px-2 py-2">
                <EstadoTag estado={a.estado} />
              </td>
              <td className="px-2 py-2">
                {a.motivo && <p className="mb-1 text-xs">{a.motivo}</p>}
                <Mensaje payload={a.payload} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Celular: tarjetas */}
      <ul className="flex flex-col gap-3 md:hidden">
        {alertas.map((a) => (
          <li key={a.id} className="flex flex-col gap-2 rounded border border-current/15 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <AccionTag accion={a.accion} />
                <span className="font-mono font-medium">{a.ticker ?? "—"}</span>
              </span>
              <span className="font-mono text-xs opacity-70">{formatearMomentoAR(a.recibida_en, ahora)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span>{a.estrategia ? NOMBRE_ESTRATEGIA[a.estrategia] : "—"}</span>
              <span className="opacity-50">·</span>
              <span className="font-mono">USD {formatearPrecio(a.precio_usd)}</span>
              <EstadoTag estado={a.estado} />
              <OrigenTag origen={a.origen} />
            </div>
            {a.motivo && <p className="text-xs">{a.motivo}</p>}
            <Mensaje payload={a.payload} />
          </li>
        ))}
      </ul>
    </>
  );
}
