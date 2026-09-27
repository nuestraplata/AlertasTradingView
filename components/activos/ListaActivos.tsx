import Link from "next/link";
import type { ActivoFila } from "@/lib/activos/fila";
import type { Estrategia } from "@/lib/activos/schema";
import { estaTildado } from "@/lib/activos/tilde";
import { BotonBorrarActivo } from "./BotonBorrarActivo";
import { TildeRapido } from "./TildeRapido";

const NOMBRE_TILDE: Record<Estrategia, string> = { corto: "Activo", intradia: "Hoy" };
const boton = "rounded border border-current/30 px-2 py-1 text-sm hover:bg-current/10";

/** Checkbox que guarda al instante. Intradía: tildado solo si la fecha es hoy. */
function Tilde({ fila, conTexto }: { fila: ActivoFila; conTexto?: boolean }) {
  return (
    <TildeRapido
      id={fila.id}
      ticker={fila.ticker_usa}
      estrategia={fila.estrategia}
      tildado={estaTildado(fila)}
      conTexto={conTexto}
    />
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
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b border-current/15 text-left text-xs uppercase opacity-60">
            <th className="w-16 px-2 py-2 font-medium">{NOMBRE_TILDE[estrategia]}</th>
            <th className="w-48 px-2 py-2 font-medium">Ticker</th>
            <th className="w-32 px-2 py-2 font-medium">Onda</th>
            <th className="px-2 py-2 font-medium">Notas</th>
            <th className="w-24 px-2 py-2">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id} className="border-b border-current/10 align-top">
              <td className="px-2 py-2">
                <Tilde fila={f} />
              </td>
              <td className="px-2 py-2">
                <Ticker fila={f} />
              </td>
              <td className="px-2 py-2">{onda(f)}</td>
              <td className="px-2 py-2">
                {f.notas ? (
                  <span title={f.notas} className="line-clamp-2 whitespace-pre-line">
                    {f.notas}
                  </span>
                ) : (
                  <span className="opacity-40">—</span>
                )}
              </td>
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

      {/* Celular: tarjetas */}
      <ul className="flex flex-col gap-3 md:hidden">
        {filas.map((f) => (
          <li key={f.id} className="flex flex-col gap-2 rounded border border-current/15 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <Ticker fila={f} />
              <Tilde fila={f} conTexto />
            </div>
            {(f.onda || f.sub_onda) && <div className="text-xs">Onda {onda(f)}</div>}
            {f.notas && <div className="line-clamp-2 text-xs opacity-70">📝 {f.notas}</div>}
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
