import { notFound } from "next/navigation";
import { ESTRATEGIAS, type Estrategia } from "@/lib/activos/schema";

/** Valida el segmento de la URL: solo /corto y /intradia existen. */
export function estrategiaDeRuta(valor: string): Estrategia {
  if (!(ESTRATEGIAS as readonly string[]).includes(valor)) notFound();
  return valor as Estrategia;
}
