"use client";

import { useActionState } from "react";
import { useAviso } from "@/components/Avisos";
import { crearTicker, type EstadoTicker } from "./actions";

const input =
  "w-full rounded border border-current/30 bg-transparent px-2 py-1 uppercase placeholder:normal-case";

export function FormNuevoTicker() {
  const avisar = useAviso();
  const [estado, accion, enviando] = useActionState(
    async (prev: EstadoTicker, fd: FormData) => {
      const r = await crearTicker(prev, fd);
      if (r?.ok) avisar(r.mensaje);
      return r;
    },
    undefined,
  );
  // Si falla, React igual resetea el form: se recargan los valores enviados.
  const valores = estado && !estado.ok ? estado.valores : undefined;
  const campos = estado && !estado.ok ? estado.campos : undefined;

  return (
    <form
      action={accion}
      className="flex flex-col gap-3 rounded border border-current/15 p-3 sm:flex-row sm:items-start"
    >
      <label className="flex flex-1 flex-col gap-1 text-sm">
        USA (TradingView)
        <input
          name="ticker_usa"
          defaultValue={valores?.ticker_usa}
          placeholder="ej. BRK.B"
          autoComplete="off"
          required
          aria-invalid={!!campos?.ticker_usa}
          className={input}
        />
        {campos?.ticker_usa && <span className="text-xs text-red-600">{campos.ticker_usa}</span>}
      </label>

      <label className="flex flex-1 flex-col gap-1 text-sm">
        BYMA (CEDEAR)
        <input
          name="ticker_byma"
          defaultValue={valores?.ticker_byma}
          placeholder="ej. BRKB"
          autoComplete="off"
          required
          aria-invalid={!!campos?.ticker_byma}
          className={input}
        />
        {campos?.ticker_byma && <span className="text-xs text-red-600">{campos.ticker_byma}</span>}
      </label>

      <div className="flex flex-col gap-1 sm:pt-5">
        <button
          type="submit"
          disabled={enviando}
          className="rounded bg-foreground px-4 py-1.5 text-sm text-background disabled:opacity-50"
        >
          {enviando ? "Agregando…" : "Agregar"}
        </button>
      </div>

      {estado && !estado.ok && !campos && (
        <p role="alert" className="text-sm text-red-600 sm:basis-full">
          {estado.error}
        </p>
      )}
    </form>
  );
}
