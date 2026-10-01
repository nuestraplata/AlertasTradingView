"use client";

import Link from "next/link";
import { useTransition } from "react";
import { cambiarEnvio } from "@/app/(panel)/actions";
import { useAviso } from "@/components/Avisos";

type Props = {
  activado: boolean;
  /** "14:03:05" / "26/09 14:03:05": cuándo se cambió el interruptor. */
  cambiadoEn: string;
  conexion: "conectado" | "sin_conexion" | "nunca";
  /** Hora de la última consulta de EasyTrading, ya formateada. */
  vistoEn: string | null;
  /** Si hay señales tomadas sin resultado: hace cuánto se tomó la más vieja. */
  sinResultadoHace: string | null;
};

/**
 * Interruptor "Envío a EasyTrading: ACTIVADO / PAUSADO", en todas las
 * pantallas (docs/ESPECIFICACION.md §10, F3). Pausar es inmediato;
 * activar pide confirmación.
 */
export function EnvioEasyTrading({ activado, cambiadoEn, conexion, vistoEn, sinResultadoHace }: Props) {
  const avisar = useAviso();
  const [cambiando, startTransition] = useTransition();

  function cambiar() {
    const activar = !activado;
    if (
      activar &&
      !confirm(
        "Activar el envío a EasyTrading.\n\n" +
          "Desde ahora, las alertas que pasen el filtro quedan como señales para que " +
          "EasyTrading las tome y opere con su configuración. ¿Activar?",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await cambiarEnvio(activar);
      if (r.ok) avisar(r.activado ? "Envío a EasyTrading ACTIVADO." : "Envío a EasyTrading PAUSADO.");
      else avisar(r.error, "error");
    });
  }

  const punto =
    conexion === "conectado" ? "bg-emerald-500" : conexion === "sin_conexion" ? "bg-red-500" : "bg-current/30";
  const textoConexion =
    conexion === "nunca"
      ? "EasyTrading todavía no consultó"
      : `EasyTrading: última consulta ${vistoEn}${conexion === "sin_conexion" ? " (sin conexión)" : ""}`;

  return (
    <div
      role="region"
      aria-label="Envío a EasyTrading"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-sm sm:px-6 ${
        activado
          ? "border-emerald-600/30 bg-emerald-600/10"
          : "border-amber-500/40 bg-amber-500/15"
      }`}
    >
      <span className="font-medium">
        Envío a EasyTrading:{" "}
        <strong className={activado ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
          {activado ? "ACTIVADO" : "PAUSADO"}
        </strong>
        <span className="ml-2 text-xs font-normal opacity-60">desde {cambiadoEn}</span>
      </span>

      <button
        type="button"
        onClick={cambiar}
        disabled={cambiando}
        className={`rounded px-3 py-1 text-sm font-medium text-white disabled:opacity-50 ${
          activado ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-700 hover:bg-emerald-800"
        }`}
      >
        {cambiando ? "…" : activado ? "⏸ Pausar todo" : "▶ Activar"}
      </button>

      {!activado && (
        <span className="text-xs opacity-80">
          Las alertas se siguen guardando, descartadas con motivo “pausado”.
        </span>
      )}

      {sinResultadoHace && (
        <Link href="/alertas#sin-resultado" className="text-xs font-medium text-red-700 underline dark:text-red-400">
          ⚠ Señal tomada sin resultado hace {sinResultadoHace}
        </Link>
      )}

      <span className="ml-auto flex items-center gap-2 text-xs opacity-80">
        <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${punto}`} />
        {textoConexion}
      </span>
    </div>
  );
}
