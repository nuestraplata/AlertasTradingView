import * as z from "zod";
import { checkbox, textoANumero, textoONull } from "@/lib/validacion";

// Estas reglas replican las restricciones de la base
// (supabase/migrations/20260926190000_tickers_y_activos.sql) para avisar
// en el formulario antes de llegar a Supabase. La base igual las controla.

export const ESTRATEGIAS = ["corto", "intradia"] as const;
export const MODOS = ["PAPER", "REAL"] as const;
export type Estrategia = (typeof ESTRATEGIAS)[number];
export type Modo = (typeof MODOS)[number];

export const NOMBRE_ESTRATEGIA: Record<Estrategia, string> = {
  corto: "Corto plazo",
  intradia: "Intradía",
};

export const NOMINALES_MAX_FACTOR = 3;
const NOMINALES_TOPE = 1_000_000;
const PRECIO_TOPE = 1_000_000_000;

const MSG_NUMERO =
  "Número inválido: usá punto o coma decimal (hasta 6 decimales), sin separador de miles.";
const MSG_ENTERO = "Tiene que ser un número entero, sin decimales ni separadores.";

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

const precioUsdOpcional = z.preprocess(
  (v) => textoANumero(v, 6),
  z
    .number({ error: MSG_NUMERO })
    .positive("Tiene que ser mayor a 0.")
    .max(PRECIO_TOPE, "Valor demasiado grande.")
    .nullable(),
);

const nominales = z.preprocess(
  (v) => textoANumero(v, 0),
  z
    .number({ error: MSG_ENTERO })
    .int(MSG_ENTERO)
    .positive("Tiene que ser mayor a 0.")
    .max(NOMINALES_TOPE, "Valor demasiado grande."),
);

const nominalesOpcional = z.preprocess(
  (v) => textoANumero(v, 0),
  z
    .number({ error: MSG_ENTERO })
    .int(MSG_ENTERO)
    .positive("Tiene que ser mayor a 0.")
    .max(NOMINALES_TOPE, "Valor demasiado grande.")
    .nullable(),
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
export const activoSchema = z
  .object({
    ticker_usa: tickerUsa,
    estrategia: z.enum(ESTRATEGIAS, { error: "Estrategia inválida." }),
    nominales,
    nominales_max: nominalesOpcional,
    entrada_usd: precioUsdOpcional,
    tp_usd: precioUsdOpcional,
    sl_usd: precioUsdOpcional,
    onda: textoOpcional(50),
    sub_onda: textoOpcional(50),
    notas: textoOpcional(2000),
    modo: z.preprocess(
      (v) => textoONull(v) ?? "PAPER",
      z.enum(MODOS, { error: "Modo inválido." }),
    ),
    tildado: z.preprocess(checkbox, z.boolean()),
  })
  .superRefine((d, ctx) => {
    if (d.nominales_max !== null && d.nominales_max < d.nominales) {
      ctx.addIssue({
        code: "custom",
        path: ["nominales_max"],
        message: "El tope no puede ser menor que los nominales.",
      });
    }
    if (d.entrada_usd !== null && d.sl_usd !== null && d.sl_usd >= d.entrada_usd) {
      ctx.addIssue({
        code: "custom",
        path: ["sl_usd"],
        message: "El SL tiene que ser menor que la entrada.",
      });
    }
    if (d.tildado && d.sl_usd === null) {
      const tilde = d.estrategia === "corto" ? "activo" : "operar hoy";
      ctx.addIssue({
        code: "custom",
        path: ["sl_usd"],
        message: `Cargá el SL para poder tildar "${tilde}" (sin SL no hay protección local).`,
      });
    }
  })
  .transform((d) => ({
    ...d,
    nominales_max: d.nominales_max ?? d.nominales * NOMINALES_MAX_FACTOR,
  }));

export type ActivoInput = z.input<typeof activoSchema>;
export type Activo = z.output<typeof activoSchema>;
