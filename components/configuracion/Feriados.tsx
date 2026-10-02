"use client";

import { useActionState, useTransition } from "react";
import { agregarFeriado, borrarFeriado, type EstadoForm } from "@/app/(panel)/configuracion/actions";
import { useAviso } from "@/components/Avisos";

export type FeriadoFila = { fecha: string; descripcion: string };

const input = "rounded border border-current/30 bg-transparent px-2 py-1.5";

/** "2026-12-25" → "vie 25/12/2026" (la fecha es un día, sin zona horaria). */
function mostrarFecha(fecha: string): string {
  const [a, m, d] = fecha.split("-");
  const dia = new Intl.DateTimeFormat("es-AR", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${fecha}T12:00:00Z`),
  );
  return `${dia} ${d}/${m}/${a}`;
}

function BotonBorrar({ f }: { f: FeriadoFila }) {
  const avisar = useAviso();
  const [borrando, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={borrando}
      aria-label={`Borrar feriado ${f.fecha}`}
      title="Borrar"
      onClick={() => {
        if (!confirm(`¿Borrar el feriado ${mostrarFecha(f.fecha)} (${f.descripcion})?`)) return;
        startTransition(async () => {
          const r = await borrarFeriado(f.fecha);
          if (r.ok) avisar(`Feriado ${f.fecha} borrado.`);
          else avisar(r.error, "error");
        });
      }}
      className="rounded px-2 py-0.5 hover:bg-current/10 disabled:opacity-50"
    >
      {borrando ? "…" : "🗑"}
    </button>
  );
}

export function Feriados({ feriados, hoy }: { feriados: FeriadoFila[]; hoy: string }) {
  const avisar = useAviso();
  const [estado, accion, guardando] = useActionState(async (prev: EstadoForm, fd: FormData) => {
    const r = await agregarFeriado(prev, fd);
    if (r?.ok) avisar(r.mensaje);
    return r;
  }, undefined);

  const error = estado && !estado.ok ? estado : undefined;
  const campos = error?.campos ?? {};
  const proximos = feriados.filter((f) => f.fecha >= hoy);
  const pasados = feriados.filter((f) => f.fecha < hoy).reverse();

  return (
    <div className="flex flex-col gap-4">
      <form action={accion} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Fecha
          <input type="date" name="fecha" required defaultValue={error?.valores?.fecha} className={input} />
          {campos.fecha && <span className="text-xs text-red-600">{campos.fecha}</span>}
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          Descripción
          <input
            name="descripcion"
            required
            maxLength={100}
            placeholder="Ej.: Día de la Soberanía Nacional"
            defaultValue={error?.valores?.descripcion}
            className={input}
          />
          {campos.descripcion && <span className="text-xs text-red-600">{campos.descripcion}</span>}
        </label>
        <button
          type="submit"
          disabled={guardando}
          className="rounded bg-foreground px-4 py-1.5 text-sm text-background disabled:opacity-50"
        >
          {guardando ? "Agregando…" : "+ Agregar"}
        </button>
      </form>
      {error && !Object.keys(campos).length && (
        <p role="alert" className="text-sm text-red-600">
          {error.error}
        </p>
      )}

      {proximos.length === 0 ? (
        <p className="text-sm opacity-70">No hay feriados próximos cargados.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-current/10 rounded border border-current/15 text-sm">
          {proximos.map((f) => (
            <li key={f.fecha} className="flex items-center gap-3 px-3 py-1.5">
              <span className="w-32 font-mono">{mostrarFecha(f.fecha)}</span>
              <span className="flex-1">{f.descripcion}</span>
              <BotonBorrar f={f} />
            </li>
          ))}
        </ul>
      )}

      {pasados.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer opacity-70">Feriados pasados ({pasados.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 opacity-70">
            {pasados.map((f) => (
              <li key={f.fecha} className="flex items-center gap-3">
                <span className="w-32 font-mono">{mostrarFecha(f.fecha)}</span>
                <span className="flex-1">{f.descripcion}</span>
                <BotonBorrar f={f} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
