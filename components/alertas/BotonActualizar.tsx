"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

/**
 * Botón "Actualizar" + recarga automática al volver a la pestaña del
 * navegador. No hay actualización periódica (no gasta cuota de Supabase).
 */
export function BotonActualizar() {
  const router = useRouter();
  const [actualizando, startTransition] = useTransition();

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [router]);

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={actualizando}
      className="rounded border border-current/30 px-3 py-1.5 text-sm hover:bg-current/10 disabled:opacity-50"
    >
      {actualizando ? "Actualizando…" : "↻ Actualizar"}
    </button>
  );
}
