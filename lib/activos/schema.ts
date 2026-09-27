import * as z from "zod";
import { checkbox, textoONull } from "@/lib/validacion";

// Estas reglas replican las restricciones de la base
// (supabase/migrations/) para avisar en el formulario antes de llegar a
// Supabase. La base igual las controla.
// Por activo la web guarda solo tilde y anotaciones: nominales, stop, TP y
// modo son de EasyTrading (docs/ESPECIFICACION.md §5 y §7).

export const ESTRATEGIAS = ["corto", "intradia"] as const;
export type Estrategia = (typeof ESTRATEGIAS)[number];

export const NOMBRE_ESTRATEGIA: Record<Estrategia, string> = {
  corto: "Corto plazo",
  intradia: "Intradía",
};

const enMayusculas = (v: unknown) => {
  const s = textoONull(v);
  return typeof s === "string" ? s.toUpperCase() : s;
};

export const tickerUsa = z.preprocess(
  enMayusculas,
  z
    .string({ error: "Cargá el ticker USA." })
    .regex(
      /^[A-Z0-9][A-Z0-9.-]{0,14}$/,
      "Ticker USA inválido: letras, números, punto o guion (máx. 15).",
    ),
);

export const tickerByma = z.preprocess(
  enMayusculas,
  z
    .string({ error: "Cargá el ticker BYMA." })
    .regex(
      /^[A-Z0-9]{1,10}$/,
      "Ticker BYMA inválido: solo letras y números, sin sufijo (máx. 10).",
    ),
);

const textoOpcional = (max: number) =>
  z.preprocess(
    textoONull,
    z.string().max(max, `Máximo ${max} caracteres.`).nullable(),
  );

/** Mapeo ticker USA → CEDEAR. */
export const tickerSchema = z.object({
  ticker_usa: tickerUsa,
  ticker_byma: tickerByma,
});
export type TickerInput = z.infer<typeof tickerSchema>;

/**
 * Datos de un activo tal como llegan del formulario. `tildado` es
 * "activo" en corto plazo y "operar hoy" en intradía; la conversión a
 * columnas de la base (activo / operar_hoy_fecha) se hace aparte.
 */
export const activoSchema = z.object({
  ticker_usa: tickerUsa,
  estrategia: z.enum(ESTRATEGIAS, { error: "Estrategia inválida." }),
  onda: textoOpcional(50),
  sub_onda: textoOpcional(50),
  notas: textoOpcional(2000),
  tildado: z.preprocess(checkbox, z.boolean()),
});

export type ActivoInput = z.input<typeof activoSchema>;
export type Activo = z.output<typeof activoSchema>;

/** Tilde rápido desde la tabla: qué activo y cómo tiene que quedar. */
export const cambioTildeSchema = z.object({
  id: z.number().int().positive(),
  estrategia: z.enum(ESTRATEGIAS),
  tildado: z.boolean(),
});
export type CambioTilde = z.infer<typeof cambioTildeSchema>;
