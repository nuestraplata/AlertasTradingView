"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { borrarActivo, type EstadoActivo } from "@/app/(panel)/[estrategia]/actions";
import { useAviso } from "@/components/Avisos";
import { NOMBRE_ESTRATEGIA, type Estrategia } from "@/lib/activos/schema";

type Props = {
  id: number;
  ticker: string;
  estrategia: Estrategia;
  /** A dónde ir después de borrar (desde el formulario de edición). */
  volverA?: string;
  className?: string;
  children?: React.ReactNode;
};

export function BotonBorrarActivo({ id, ticker, estrategia, volverA, className, children }: Props) {
  const avisar = useAviso();
  const router = useRouter();
  const [, borrar, borrando] = useActionState(async (prev: EstadoActivo, fd: FormData) => {
    const r = await borrarActivo(prev, fd);
    if (r?.ok) {
      avisar(r.mensaje);
      if (volverA) router.push(volverA);
    } else if (r) {
      avisar(r.error, "error");
    }
    return r;
  }, undefined);

  return (
    <form
      action={borrar}
      onSubmit={(e) => {
        if (!confirm(`¿Borrar ${ticker} de ${NOMBRE_ESTRATEGIA[estrategia]}?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="estrategia" value={estrategia} />
      <button
        type="submit"
        disabled={borrando}
        aria-label={`Borrar ${ticker}`}
        title="Borrar"
        className={className}
      >
        {borrando ? "…" : (children ?? "🗑")}
      </button>
    </form>
  );
}
