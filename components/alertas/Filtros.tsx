import Link from "next/link";
import { NOMBRE_ESTRATEGIA } from "@/lib/activos/schema";
import { hayFiltros, urlAlertas, type Filtros as TFiltros } from "@/lib/alertas/filtros";

type Opcion<K extends keyof TFiltros> = { valor: TFiltros[K]; texto: string };

const GRUPOS: {
  [K in "estrategia" | "accion" | "estado" | "origen"]: { titulo: string; opciones: Opcion<K>[] };
} = {
  estrategia: {
    titulo: "Estrategia",
    opciones: [
      { valor: "corto", texto: NOMBRE_ESTRATEGIA.corto },
      { valor: "intradia", texto: NOMBRE_ESTRATEGIA.intradia },
    ],
  },
  accion: {
    titulo: "Acción",
    opciones: [
      { valor: "compra", texto: "Compra" },
      { valor: "venta", texto: "Venta" },
    ],
  },
  estado: {
    titulo: "Estado",
    opciones: [
      { valor: "senal", texto: "Señal" },
      { valor: "descartada", texto: "Descartada" },
      { valor: "recibida", texto: "Recibida (F2)" },
    ],
  },
  origen: {
    titulo: "Origen",
    opciones: [
      { valor: "tradingview", texto: "TradingView" },
      { valor: "simulada", texto: "Simulada" },
    ],
  },
};

const chip = "rounded-full border px-3 py-1 text-xs whitespace-nowrap";

/** Filtros como links: funcionan sin JavaScript y quedan en la URL. */
export function Filtros({ filtros }: { filtros: TFiltros }) {
  return (
    <div className="flex flex-col gap-2">
      {(Object.keys(GRUPOS) as (keyof typeof GRUPOS)[]).map((clave) => {
        const grupo = GRUPOS[clave];
        const actual = filtros[clave];
        return (
          <div key={clave} className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-xs opacity-60">{grupo.titulo}</span>
            <Link
              href={urlAlertas(filtros, { [clave]: null })}
              aria-current={actual === null ? "true" : undefined}
              className={`${chip} ${actual === null ? "border-foreground bg-foreground text-background" : "border-current/30 hover:bg-current/10"}`}
            >
              Todas
            </Link>
            {grupo.opciones.map((o) => {
              const activa = actual === o.valor;
              return (
                <Link
                  key={String(o.valor)}
                  href={urlAlertas(filtros, { [clave]: activa ? null : o.valor })}
                  aria-current={activa ? "true" : undefined}
                  className={`${chip} ${activa ? "border-foreground bg-foreground text-background" : "border-current/30 hover:bg-current/10"}`}
                >
                  {o.texto}
                </Link>
              );
            })}
          </div>
        );
      })}
      {hayFiltros(filtros) && (
        <Link href="/alertas" className="self-start text-xs underline opacity-70">
          Quitar todos los filtros
        </Link>
      )}
    </div>
  );
}
