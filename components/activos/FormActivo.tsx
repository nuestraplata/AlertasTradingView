"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { guardarActivo, type EstadoActivo } from "@/app/(panel)/[estrategia]/actions";
import { useAviso } from "@/components/Avisos";
import type { ValoresFormulario } from "@/lib/activos/fila";
import type { Estrategia } from "@/lib/activos/schema";
import { BotonBorrarActivo } from "./BotonBorrarActivo";

type Props = {
  estrategia: Estrategia;
  /** Opciones del desplegable de ticker (solo en alta). */
  tickers?: { ticker_usa: string; ticker_byma: string; enLista: boolean }[];
  /** Solo en edición. */
  editar?: { id: number; ticker_byma: string; valores: ValoresFormulario; tildado: boolean };
};

const input = "w-full rounded border border-current/30 bg-transparent px-2 py-1.5";
const boton = "rounded border border-current/30 px-3 py-1.5 text-sm hover:bg-current/10";

const TEXTO_TILDE: Record<Estrategia, { etiqueta: string; ayuda: string }> = {
  corto: {
    etiqueta: "Activo",
    ayuda:
      "Las alertas de compra pasan a EasyTrading. Se destilda solo cuando EasyTrading avisa que cerró la posición.",
  },
  intradia: {
    etiqueta: "Operar hoy",
    ayuda: "Las alertas de compra pasan a EasyTrading solo hoy: se destilda solo a las 00:00.",
  },
};

export function FormActivo({ estrategia, tickers, editar }: Props) {
  const avisar = useAviso();
  const router = useRouter();
  const lista = `/${estrategia}`;

  const [estado, accion, guardando] = useActionState(async (prev: EstadoActivo, fd: FormData) => {
    const r = await guardarActivo(prev, fd);
    if (r?.ok) {
      avisar(r.mensaje);
      router.push(lista);
    }
    return r;
  }, undefined);

  const error = estado && !estado.ok ? estado : undefined;
  // Si falla, React resetea el form: se vuelven a poner los valores enviados.
  const v = error?.valores ?? editar?.valores;
  const campos = error?.campos ?? {};
  const tildadoInicial = error ? error.valores?.tildado === "on" : (editar?.tildado ?? false);
  const tickerElegido = editar?.valores.ticker_usa ?? "";

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <form action={accion} className="flex flex-col gap-5">
        <input type="hidden" name="estrategia" value={estrategia} />
        {editar && <input type="hidden" name="id" value={editar.id} />}

        {/* Ticker */}
        <label className="flex flex-col gap-1 text-sm">
          Ticker
          {editar ? (
            <>
              <input type="hidden" name="ticker_usa" value={tickerElegido} />
              <span className="font-mono text-base">
                {tickerElegido} <span className="opacity-50">→</span> {editar.ticker_byma}
              </span>
              <span className="text-xs opacity-60">
                El ticker no se cambia: para otro, borrá este y creá uno nuevo.
              </span>
            </>
          ) : (
            <>
              <select
                name="ticker_usa"
                defaultValue={v?.ticker_usa ?? ""}
                required
                aria-invalid={!!campos.ticker_usa}
                className={input}
              >
                <option value="" disabled>
                  Elegí un ticker…
                </option>
                {tickers?.map((t) => (
                  <option key={t.ticker_usa} value={t.ticker_usa} disabled={t.enLista}>
                    {t.ticker_usa} → {t.ticker_byma}
                    {t.enLista ? " (ya está en la lista)" : ""}
                  </option>
                ))}
              </select>
              <span className="text-xs opacity-70">
                ¿No está?{" "}
                <Link href="/tickers" className="underline">
                  Cargalo en Tickers
                </Link>
                .
              </span>
            </>
          )}
          <CampoError mensaje={campos.ticker_usa} />
        </label>

        {/* Tilde */}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="tildado"
            defaultChecked={tildadoInicial}
            className="mt-0.5 size-4"
          />
          <span>
            <span className="font-medium">{TEXTO_TILDE[estrategia].etiqueta}</span>
            <span className="block text-xs opacity-60">{TEXTO_TILDE[estrategia].ayuda}</span>
          </span>
        </label>

        {/* Anotaciones */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Onda
            <input name="onda" maxLength={50} defaultValue={v?.onda} className={input} />
            <CampoError mensaje={campos.onda} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Sub-onda
            <input name="sub_onda" maxLength={50} defaultValue={v?.sub_onda} className={input} />
            <CampoError mensaje={campos.sub_onda} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Notas
          <textarea name="notas" rows={4} maxLength={2000} defaultValue={v?.notas} className={input} />
          <CampoError mensaje={campos.notas} />
        </label>

        <p className="text-xs opacity-60">
          Nominales, stop, TP y modo PAPER/REAL se configuran en EasyTrading.
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={guardando}
            className="rounded bg-foreground px-4 py-1.5 text-sm text-background disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <Link href={lista} className={boton}>
            Cancelar
          </Link>
        </div>
      </form>

      {/* Fuera del form principal: un <form> no puede ir dentro de otro. */}
      {editar && (
        <div className="border-t border-current/15 pt-4">
          <BotonBorrarActivo
            id={editar.id}
            ticker={tickerElegido}
            estrategia={estrategia}
            volverA={lista}
            className={`${boton} text-red-600`}
          >
            Borrar {tickerElegido} de esta lista
          </BotonBorrarActivo>
        </div>
      )}
    </div>
  );
}

function CampoError({ mensaje }: { mensaje?: string }) {
  return mensaje ? <span className="text-xs text-red-600">{mensaje}</span> : null;
}
