import Link from "next/link";
import { notFound } from "next/navigation";
import { FormActivo } from "@/components/activos/FormActivo";
import { COLUMNAS_ACTIVO, valoresFormulario, type ActivoFila } from "@/lib/activos/fila";
import { NOMBRE_ESTRATEGIA } from "@/lib/activos/schema";
import { estaTildado } from "@/lib/activos/tilde";
import { clienteConSesion } from "@/lib/auth/sesion";
import { traducirErrorDb } from "@/lib/db/errores";
import { estrategiaDeRuta } from "../estrategia";

export default async function EditarActivoPage({ params }: PageProps<"/[estrategia]/[id]">) {
  const p = await params;
  const estrategia = estrategiaDeRuta(p.estrategia);
  if (!/^\d{1,15}$/.test(p.id)) notFound();

  const { supabase } = await clienteConSesion();
  const { data, error } = await supabase
    .from("activos")
    .select(COLUMNAS_ACTIVO)
    .eq("id", Number(p.id))
    .eq("estrategia", estrategia)
    .maybeSingle();

  if (error) {
    console.error("[activos] editar", error);
    return <p role="alert">❌ No se pudo cargar el activo: {traducirErrorDb(error)}</p>;
  }
  if (!data) notFound();

  const fila = data as unknown as ActivoFila;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/${estrategia}`} className="text-sm opacity-70 hover:underline">
          ← {NOMBRE_ESTRATEGIA[estrategia]}
        </Link>
        <h1 className="text-xl font-semibold">
          Editar {fila.ticker_usa} en {NOMBRE_ESTRATEGIA[estrategia]}
        </h1>
      </div>
      <FormActivo
        estrategia={estrategia}
        editar={{
          id: fila.id,
          ticker_byma: fila.tickers?.ticker_byma ?? "?",
          valores: valoresFormulario(fila),
          tildado: estaTildado(fila),
        }}
      />
    </div>
  );
}
