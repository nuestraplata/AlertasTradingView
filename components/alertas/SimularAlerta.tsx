"use client";

import { useActionState, useState } from "react";
import { simularAlerta, type EstadoSimulacion } from "@/app/(panel)/alertas/actions";
import { useAviso } from "@/components/Avisos";
import { pasoElFiltro } from "@/lib/alertas/registrar";

/** El formato de la especificación (§4), tal como va en TradingView. */
const MENSAJE_EJEMPLO = `{
  "clave": "CLAVE_SECRETA",
  "estrategia": "corto",
  "accion": "compra",
  "ticker": "{{ticker}}",
  "precio": "{{close}}",
  "hora": "{{timenow}}"
}`;

const input = "w-full rounded border border-current/30 bg-transparent px-2 py-1.5 text-sm";
const pestania = "rounded px-3 py-1 text-sm";

type Modo = "simple" | "json";

/**
 * Panel para probar sin TradingView. Pasa por el mismo camino que el
 * webhook (incluido el filtro de señales); la alerta queda marcada como
 * "Simulada". Solo genera una señal real para EasyTrading si se tilda
 * "enviar" (por defecto, no: muestra qué habría pasado).
 */
export function SimularAlerta({ tickers }: { tickers: string[] }) {
  const avisar = useAviso();
  const [estado, accion, enviando] = useActionState(async (prev: EstadoSimulacion, fd: FormData) => {
    const r = await simularAlerta(prev, fd);
    if (r?.ok) {
      avisar(
        r.estado === "senal"
          ? `Alerta simulada #${r.id}: señal #${r.senalId} enviada a EasyTrading.`
          : pasoElFiltro(r)
            ? `Alerta simulada #${r.id}: pasó el filtro (no se envió).`
            : `Alerta simulada #${r.id} registrada como Descartada.`,
        pasoElFiltro(r) ? "ok" : "error",
      );
    }
    return r;
  }, undefined);

  const v = estado?.valores;
  const [modo, setModo] = useState<Modo>(v?.modo === "json" ? "json" : "simple");

  return (
    <details className="rounded border border-dashed border-current/30 p-3">
      <summary className="cursor-pointer text-sm font-medium">🧪 Simular alerta</summary>

      <form action={accion} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="modo" value={modo} />

        <div role="tablist" className="flex gap-1">
          {(
            [
              ["simple", "Formulario"],
              ["json", "Pegar mensaje de TradingView"],
            ] as const
          ).map(([m, texto]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              onClick={() => setModo(m)}
              className={`${pestania} ${modo === m ? "bg-foreground text-background" : "hover:bg-current/10"}`}
            >
              {texto}
            </button>
          ))}
        </div>

        {modo === "simple" ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs">
              Estrategia
              <select name="estrategia" defaultValue={v?.estrategia ?? "corto"} className={input}>
                <option value="corto">corto</option>
                <option value="intradia">intradia</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Acción
              <select name="accion" defaultValue={v?.accion ?? "compra"} className={input}>
                <option value="compra">compra</option>
                <option value="venta">venta</option>
                <option value="sl">sl (inválida: para probar)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Ticker
              <input
                name="ticker"
                list="simular-tickers"
                defaultValue={v?.ticker ?? tickers[0] ?? "AAPL"}
                autoComplete="off"
                className={`${input} uppercase`}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Precio USD
              <input name="precio" inputMode="decimal" defaultValue={v?.precio ?? "100"} className={input} />
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs">
              Mensaje (tal cual está en la alerta de TradingView)
              <textarea
                name="json"
                rows={9}
                defaultValue={v?.json || MENSAJE_EJEMPLO}
                spellCheck={false}
                className={`${input} font-mono text-xs`}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                Valor de {"{{ticker}}"}
                <input
                  name="ticker"
                  list="simular-tickers"
                  defaultValue={v?.ticker ?? tickers[0] ?? "AAPL"}
                  autoComplete="off"
                  className={input}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Valor de {"{{close}}"}
                <input name="precio" defaultValue={v?.precio ?? "100"} className={input} />
              </label>
            </div>
            <p className="text-xs opacity-60">
              {"{{timenow}}"} se reemplaza por la hora actual. El campo &quot;clave&quot; se reemplaza en el
              servidor por la clave real: no hace falta pegarla.
            </p>
          </div>
        )}

        <datalist id="simular-tickers">
          {tickers.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>

        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" name="enviar" className="mt-0.5" />
          <span>
            Si pasa el filtro, <strong>enviarla a EasyTrading</strong> como señal (marcada “simulada”).
            Sin este tilde solo se muestra qué habría pasado.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={enviando}
            className="rounded bg-foreground px-4 py-1.5 text-sm text-background disabled:opacity-50"
          >
            {enviando ? "Enviando…" : "Simular"}
          </button>
          <span className="text-xs opacity-60">Queda registrada como “Simulada”.</span>
        </div>

        {estado && (
          <p
            role={estado.ok ? "status" : "alert"}
            className={`text-sm ${estado.ok && pasoElFiltro(estado) ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}
          >
            {estado.ok
              ? estado.estado === "senal"
                ? `✓ #${estado.id}: señal #${estado.senalId} enviada a EasyTrading (vence en 60 s).`
                : pasoElFiltro(estado)
                  ? `✓ #${estado.id}: pasó el filtro. No se envió a EasyTrading (no estaba tildado “enviar”).`
                  : `✗ #${estado.id} Descartada: ${estado.motivo}`
              : `✗ ${estado.error}`}
          </p>
        )}
      </form>
    </details>
  );
}
