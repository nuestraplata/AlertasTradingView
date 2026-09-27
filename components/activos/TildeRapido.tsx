"use client";

import { useOptimistic, useTransition } from "react";
import { cambiarTilde } from "@/app/(panel)/[estrategia]/actions";
import { useAviso } from "@/components/Avisos";
import type { Estrategia } from "@/lib/activos/schema";

type Props = {
  id: number;
  ticker: string;
  estrategia: Estrategia;
  tildado: boolean;
  /** Texto visible al lado del checkbox (en las tarjetas del celular). */
  conTexto?: boolean;
};

const ETIQUETA: Record<Estrategia, string> = { corto: "Activo", intradia: "Operar hoy" };

/**
 * Checkbox que guarda al instante. Cambia en pantalla enseguida
 * (optimista); si el servidor falla, vuelve al valor real y avisa.
 */
export function TildeRapido({ id, ticker, estrategia, tildado, conTexto }: Props) {
  const avisar = useAviso();
  const [guardando, startTransition] = useTransition();
  const [visible, setVisible] = useOptimistic(tildado);

  function cambiar(nuevo: boolean) {
    startTransition(async () => {
      setVisible(nuevo);
      try {
        const r = await cambiarTilde({ id, estrategia, tildado: nuevo });
        if (!r.ok) avisar(`${ticker}: ${r.error}`, "error");
      } catch {
        // Sin conexión o servidor caído: la llamada lanza en vez de devolver.
        avisar(`${ticker}: no se pudo guardar (¿sin conexión?). Probá de nuevo.`, "error");
      }
    });
  }

  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 ${guardando ? "opacity-60" : ""}`}
      title={guardando ? "Guardando…" : undefined}
    >
      <input
        type="checkbox"
        checked={visible}
        disabled={guardando}
        onChange={(e) => cambiar(e.target.checked)}
        aria-label={`${ETIQUETA[estrategia]} ${ticker}`}
        aria-busy={guardando}
        className="size-5 cursor-pointer accent-emerald-600"
      />
      {conTexto && <span className="text-xs">{ETIQUETA[estrategia]}</span>}
    </label>
  );
}
