"use client";

import { useActionState, useState } from "react";
import { useAviso } from "@/components/Avisos";
import { NOMBRE_ESTRATEGIA, type Estrategia } from "@/lib/activos/schema";
import { nombresListas } from "@/lib/tickers/usos";
import { borrarTicker, editarTicker, type EstadoTicker } from "./actions";

type Props = {
  ticker: { ticker_usa: string; ticker_byma: string };
  usos: Estrategia[];
};

const fila =
  "grid grid-cols-2 items-center gap-x-3 gap-y-2 border-b border-current/10 px-2 py-2 sm:grid-cols-[8rem_8rem_1fr_auto]";
const boton = "rounded border border-current/30 px-2 py-1 text-sm hover:bg-current/10 disabled:opacity-40";
const input = "w-full rounded border border-current/30 bg-transparent px-2 py-1 uppercase";

export function FilaTicker({ ticker, usos }: Props) {
  const [editando, setEditando] = useState(false);
  const avisar = useAviso();

  const conAviso =
    (accion: (p: EstadoTicker, fd: FormData) => Promise<EstadoTicker>, alTerminar?: () => void) =>
    async (prev: EstadoTicker, fd: FormData) => {
      const r = await accion(prev, fd);
      if (r?.ok) {
        avisar(r.mensaje);
        alTerminar?.();
      } else if (r) {
        avisar(r.error, "error");
      }
      return r;
    };

  const [estadoEdicion, editar, guardando] = useActionState(
    conAviso(editarTicker, () => setEditando(false)),
    undefined,
  );
  const [, borrar, borrando] = useActionState(conAviso(borrarTicker), undefined);

  const enUso = usos.length > 0;

  if (editando) {
    const valores = estadoEdicion && !estadoEdicion.ok ? estadoEdicion.valores : undefined;
    const campos = estadoEdicion && !estadoEdicion.ok ? estadoEdicion.campos : undefined;
    return (
      <li>
        <form action={editar} className={fila}>
          <input type="hidden" name="original" value={ticker.ticker_usa} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs opacity-60 sm:sr-only">USA</span>
            <input
              name="ticker_usa"
              defaultValue={valores?.ticker_usa ?? ticker.ticker_usa}
              required
              aria-invalid={!!campos?.ticker_usa}
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs opacity-60 sm:sr-only">BYMA</span>
            <input
              name="ticker_byma"
              defaultValue={valores?.ticker_byma ?? ticker.ticker_byma}
              required
              aria-invalid={!!campos?.ticker_byma}
              className={input}
            />
          </label>
          <span className="col-span-2 text-xs opacity-70 sm:col-span-1">
            {enUso && "Si cambiás el USA, se actualiza solo en las listas."}
          </span>
          <div className="col-span-2 flex gap-2 sm:col-span-1">
            <button type="submit" disabled={guardando} className={boton}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" onClick={() => setEditando(false)} className={boton}>
              Cancelar
            </button>
          </div>
          {campos && (
            <p role="alert" className="col-span-2 text-xs text-red-600 sm:col-span-4">
              {Object.values(campos).join(" ")}
            </p>
          )}
        </form>
      </li>
    );
  }

  return (
    <li className={fila}>
      <span className="font-mono font-medium">{ticker.ticker_usa}</span>
      <span className="font-mono">
        <span className="opacity-50 sm:hidden">→ </span>
        {ticker.ticker_byma}
      </span>
      <span className="col-span-2 flex flex-wrap gap-1 sm:col-span-1">
        {enUso ? (
          usos.map((e) => (
            <span key={e} className="rounded bg-current/10 px-1.5 py-0.5 text-xs">
              {NOMBRE_ESTRATEGIA[e]}
            </span>
          ))
        ) : (
          <span className="text-xs opacity-50">Sin usar</span>
        )}
      </span>
      <div className="col-span-2 flex gap-2 sm:col-span-1">
        <button type="button" onClick={() => setEditando(true)} className={boton}>
          Editar
        </button>
        <form
          action={borrar}
          onSubmit={(e) => {
            if (!confirm(`¿Borrar ${ticker.ticker_usa} → ${ticker.ticker_byma}?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="ticker_usa" value={ticker.ticker_usa} />
          <button
            type="submit"
            disabled={enUso || borrando}
            title={enUso ? `Se usa en ${nombresListas(usos)}: sacalo de ahí primero.` : undefined}
            className={boton}
          >
            {borrando ? "Borrando…" : "Borrar"}
          </button>
        </form>
      </div>
      {enUso && (
        <span className="col-span-2 text-xs opacity-60 sm:hidden">
          Para borrarlo, sacalo primero de {nombresListas(usos)}.
        </span>
      )}
    </li>
  );
}
