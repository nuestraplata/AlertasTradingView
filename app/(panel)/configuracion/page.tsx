import type { Metadata } from "next";
import { Feriados, type FeriadoFila } from "@/components/configuracion/Feriados";
import { FormHorario } from "@/components/configuracion/FormHorario";
import { clienteConSesion } from "@/lib/auth/sesion";
import { horaCorta } from "@/lib/configuracion/schema";
import { traducirErrorDb } from "@/lib/db/errores";
import { formatearMomentoAR, hoyAR } from "@/lib/fechas";

export const metadata: Metadata = { title: "Configuración · Alertas TradingView" };

export default async function ConfiguracionPage() {
  const { supabase } = await clienteConSesion();
  const ahora = new Date();

  const [conf, feriados] = await Promise.all([
    supabase
      .from("configuracion")
      .select("hora_apertura, hora_cierre, horario_cambiado_en")
      .eq("id", 1)
      .maybeSingle(),
    supabase.from("feriados").select("fecha, descripcion").order("fecha"),
  ]);

  const error = conf.error ?? feriados.error;
  if (error || !conf.data) {
    if (error) console.error("[configuración] carga", error);
    return (
      <p role="alert">
        ❌ No se pudo cargar la configuración:{" "}
        {error ? traducirErrorDb(error) : "falta la fila de configuración (¿se corrió la migración 4?)."}
      </p>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <h1 className="text-xl font-semibold">Configuración</h1>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Horario de mercado (hora de Argentina)</h2>
        <p className="text-sm opacity-70">
          Las alertas que llegan fuera de este horario, un sábado, un domingo o un feriado se guardan
          descartadas. Se usa la hora en que llega al servidor, no la de TradingView. El cierre no se
          incluye: con cierre 17:00, una alerta de las 17:00:00 ya se descarta.
        </p>
        <FormHorario apertura={horaCorta(conf.data.hora_apertura)} cierre={horaCorta(conf.data.hora_cierre)} />
        <p className="text-xs opacity-60">
          Último cambio: {formatearMomentoAR(conf.data.horario_cambiado_en, ahora)}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Feriados</h2>
        <p className="text-sm opacity-70">Días sin mercado. Se cargan a mano.</p>
        <Feriados feriados={(feriados.data ?? []) as FeriadoFila[]} hoy={hoyAR(ahora)} />
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="font-medium">Reglas fijas</h2>
        <ul className="list-disc pl-5 opacity-80">
          <li>Una señal que EasyTrading no toma en 60 s vence y no se ejecuta nunca.</li>
          <li>Una alerta igual (mismo ticker, estrategia y acción) a otra de los últimos 30 s se descarta.</li>
          <li>
            El tilde (“activo” / “operar hoy”) filtra solo compras: las ventas pasan siempre que el activo
            esté en la lista.
          </li>
          <li>Nominales, stop, take profit, trailing y PAPER/REAL los decide EasyTrading, no la web.</li>
        </ul>
      </section>
    </div>
  );
}
