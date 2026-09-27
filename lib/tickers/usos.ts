import { ESTRATEGIAS, NOMBRE_ESTRATEGIA, type Estrategia } from "@/lib/activos/schema";

/** En qué listas se usa cada ticker USA, en orden fijo (corto, intradía). */
export function usosPorTicker(
  activos: { ticker_usa: string; estrategia: Estrategia }[],
): Record<string, Estrategia[]> {
  const usos: Record<string, Set<Estrategia>> = {};
  for (const a of activos) (usos[a.ticker_usa] ??= new Set()).add(a.estrategia);
  return Object.fromEntries(
    Object.entries(usos).map(([t, s]) => [t, ESTRATEGIAS.filter((e) => s.has(e))]),
  );
}

/** ["corto","intradia"] → "Corto plazo e Intradía". */
export function nombresListas(estrategias: Estrategia[]): string {
  const n = estrategias.map((e) => NOMBRE_ESTRATEGIA[e]);
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} e ${n.at(-1)}`;
}
