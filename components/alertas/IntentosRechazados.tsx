import { formatearMomentoAR } from "@/lib/fechas";

export type IntentoFila = { id: number; recibido_en: string; ip: string | null; motivo: string };

const MOTIVO: Record<string, string> = {
  clave_invalida: "Clave inválida",
  ip_no_permitida: "IP no permitida",
  mensaje_ilegible: "Mensaje ilegible (no es JSON)",
  cuerpo_demasiado_grande: "Mensaje demasiado grande",
};

/**
 * Pedidos al webhook que no llegaron a ser alerta (últimas 24 h).
 * Plegado: se abre solo si hay alguno, para que se note.
 */
export function IntentosRechazados({ intentos, ahora }: { intentos: IntentoFila[]; ahora: Date }) {
  const n = intentos.length;
  return (
    <details open={n > 0} className="rounded border border-current/15 p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Intentos rechazados (últimas 24 h):{" "}
        <span className={n > 0 ? "text-amber-700 dark:text-amber-400" : "opacity-60"}>{n}</span>
      </summary>
      {n === 0 ? (
        <p className="mt-2 text-xs opacity-60">Ninguno.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1 text-xs">
          {intentos.map((i) => (
            <li key={i.id} className="flex flex-wrap gap-x-3 font-mono">
              <span>{formatearMomentoAR(i.recibido_en, ahora)}</span>
              <span className="font-sans">{MOTIVO[i.motivo] ?? i.motivo}</span>
              <span className="opacity-60">IP {i.ip ?? "desconocida"}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs opacity-60">
        Muchos seguidos pueden indicar que la clave está mal configurada en TradingView o que alguien
        está probando la URL.
      </p>
    </details>
  );
}
