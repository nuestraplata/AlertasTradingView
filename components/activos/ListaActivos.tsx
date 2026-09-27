import Link from "next/link";
import { formatearPrecio, type ActivoFila } from "@/lib/activos/fila";
import type { Estrategia } from "@/lib/activos/schema";
import { estaTildado } from "@/lib/activos/tilde";
import { BotonBorrarActivo } from "./BotonBorrarActivo";

const NOMBRE_TILDE: Record<Estrategia, string> = { corto: "Activo", intradia: "Hoy" };
const boton = "rounded border border-current/30 px-2 py-1 text-sm hover:bg-current/10";

/** Tilde en modo lectura (en 7c pasa a ser un checkbox que guarda al instante). */
function Tilde({ fila }: { fila: ActivoFila }) {
  if (fila.sl_usd === null) {
    return (
      <span title="Cargá el SL para poder tildar" className="text-amber-600">
        ⚠ sin SL
      </span>
    );
  }
  return estaTildado(fila) ? (
    <span aria-label="Tildado">✅</span>
  ) : (
    <span aria-label="Sin tildar" className="opacity-40">
      ☐
    </span>
  );
}

function Modo({ modo }: { modo: ActivoFila["modo"] }) {
  return modo === "REAL" ? (
    <span className="rounded bg-orange-600 px-1.5 py-0.5 text-xs font-semibold text-white">
      REAL
    </span>
  ) : (
    <span className="rounded bg-current/10 px-1.5 py-0.5 text-xs">PAPER</span>
  );
}

function Ticker({ fila }: { fila: ActivoFila }) {
  return (
    <span className="font-mono">
      <span className="font-medium">{fila.ticker_usa}</span>
      <span className="opacity-50"> → </span>
      {fila.tickers?.ticker_byma ?? "?"}
    </span>
  );
}

function onda(fila: ActivoFila) {
  if (!fila.onda && !fila.sub_onda) return "—";
  return [fila.onda, fila.sub_onda].filter(Boolean).join(" / ");
}

export function ListaActivos({ filas, estrategia }: { filas: ActivoFila[]; estrategia: Estrategia }) {
  const editar = (f: ActivoFila) => `/${estrategia}/${f.id}`;

  return (
    <>
      {/* Computadora: tabla */}
      <table className="hidden w-full text-sm lg:table">
        <thead>
          <tr className="border-b border-current/15 text-left text-xs uppercase opacity-60">
            <th className="px-2 py-2 font-medium">{NOMBRE_TILDE[estrategia]}</th>
            <th className="px-2 py-2 font-medium">Ticker</th>
            <th className="px-2 py-2 text-right font-medium">Nominales</th>
            <th className="px-2 py-2 text-right font-medium">Tope</th>
            <th className="px-2 py-2 text-right font-medium">Entrada</th>
            <th className="px-2 py-2 text-right font-medium">SL</th>
            <th className="px-2 py-2 text-right font-medium">TP</th>
            <th className="px-2 py-2 font-medium">Modo</th>
            <th className="px-2 py-2 font-medium">Onda</th>
            <th className="px-2 py-2">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id} className="border-b border-current/10">
              <td className="px-2 py-2">
                <Tilde fila={f} />
              </td>
              <td className="px-2 py-2">
                <Ticker fila={f} />
                {f.notas && (
                  <span title={f.notas} className="ml-2 cursor-help" aria-label={`Notas: ${f.notas}`}>
                    📝
                  </span>
                )}
              </td>
              <td className="px-2 py-2 text-right font-mono">{f.nominales}</td>
              <td className="px-2 py-2 text-right font-mono opacity-70">{f.nominales_max}</td>
              <td className="px-2 py-2 text-right font-mono">{formatearPrecio(f.entrada_usd)}</td>
              <td className="px-2 py-2 text-right font-mono">{formatearPrecio(f.sl_usd)}</td>
              <td className="px-2 py-2 text-right font-mono">{formatearPrecio(f.tp_usd)}</td>
              <td className="px-2 py-2">
                <Modo modo={f.modo} />
              </td>
              <td className="px-2 py-2">{onda(f)}</td>
              <td className="px-2 py-2">
                <div className="flex justify-end gap-2">
                  <Link href={editar(f)} className={boton} aria-label={`Editar ${f.ticker_usa}`} title="Editar">
                    ✎
                  </Link>
                  <BotonBorrarActivo id={f.id} ticker={f.ticker_usa} estrategia={estrategia} className={boton} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Celular / tablet: tarjetas */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {filas.map((f) => (
          <li key={f.id} className="flex flex-col gap-2 rounded border border-current/15 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Tilde fila={f} />
                <Ticker fila={f} />
              </span>
              <Modo modo={f.modo} />
            </div>
            <div>
              Nominales <span className="font-mono font-medium">{f.nominales}</span>
              <span className="opacity-60"> · tope {f.nominales_max}</span>
            </div>
            <div className="font-mono text-xs">
              Entrada {formatearPrecio(f.entrada_usd)} · SL {formatearPrecio(f.sl_usd)} · TP{" "}
              {formatearPrecio(f.tp_usd)}
            </div>
            {(f.onda || f.sub_onda) && <div className="text-xs">Onda {onda(f)}</div>}
            {f.notas && <div className="line-clamp-1 text-xs opacity-70">📝 {f.notas}</div>}
            <div className="flex justify-end gap-2">
              <Link href={editar(f)} className={boton}>
                Editar
              </Link>
              <BotonBorrarActivo id={f.id} ticker={f.ticker_usa} estrategia={estrategia} className={boton} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
