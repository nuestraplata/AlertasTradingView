"use client";

import { useActionState } from "react";
import { guardarHorario, type EstadoForm } from "@/app/(panel)/configuracion/actions";
import { useAviso } from "@/components/Avisos";

const input = "rounded border border-current/30 bg-transparent px-2 py-1.5 font-mono";

export function FormHorario({ apertura, cierre }: { apertura: string; cierre: string }) {
  const avisar = useAviso();
  const [estado, accion, guardando] = useActionState(async (prev: EstadoForm, fd: FormData) => {
    const r = await guardarHorario(prev, fd);
    if (r?.ok) avisar(r.mensaje);
    return r;
  }, undefined);

  const error = estado && !estado.ok ? estado : undefined;
  const v = error?.valores;
  const campos = error?.campos ?? {};

  return (
    <form action={accion} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Apertura
          <input type="time" name="hora_apertura" required defaultValue={v?.hora_apertura ?? apertura} className={input} />
          {campos.hora_apertura && <span className="text-xs text-red-600">{campos.hora_apertura}</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Cierre
          <input type="time" name="hora_cierre" required defaultValue={v?.hora_cierre ?? cierre} className={input} />
          {campos.hora_cierre && <span className="text-xs text-red-600">{campos.hora_cierre}</span>}
        </label>
        <button
          type="submit"
          disabled={guardando}
          className="rounded bg-foreground px-4 py-1.5 text-sm text-background disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar horario"}
        </button>
      </div>
      {error && !Object.keys(campos).length && (
        <p role="alert" className="text-sm text-red-600">
          {error.error}
        </p>
      )}
    </form>
  );
}
