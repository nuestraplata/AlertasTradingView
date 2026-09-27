-- =====================================================================
-- Migración 3 (F2): registro de alertas e intentos rechazados.
-- Correr completo en Supabase → SQL Editor. Es todo-o-nada: si algo
-- falla, no queda nada a medias.
--
-- Quién escribe: SOLO el servidor (webhook y "simular alerta"), con la
-- clave secreta de Supabase (rol service_role). El panel solo lee.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- alertas: toda alerta con clave válida, recibida o descartada.
-- Las columnas ticker / estrategia / accion / precio_usd guardan el
-- valor ya validado (o null si vino mal); el mensaje original, sin la
-- clave, queda en payload.
-- ---------------------------------------------------------------------
create table public.alertas (
  id           bigint generated always as identity primary key,
  recibida_en  timestamptz not null default now(),
  origen       text not null check (origen in ('tradingview', 'simulada')),
  payload      jsonb not null,

  ticker       text check (ticker ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$'),
  estrategia   text check (estrategia in ('corto', 'intradia')),
  accion       text check (accion in ('compra', 'venta')),
  precio_usd   numeric(18, 6) check (precio_usd > 0),
  hora_tv      text check (char_length(hora_tv) <= 50), -- {{timenow}}, solo registro

  -- F2: recibida | descartada. F3 agrega los estados de señal.
  estado       text not null check (estado in ('recibida', 'descartada')),
  motivo       text check (char_length(motivo) <= 500),

  -- Descartada siempre con motivo; recibida sin motivo y con datos completos.
  constraint alertas_estado_coherente check (
    (estado = 'descartada' and motivo is not null) or
    (estado = 'recibida' and motivo is null
      and ticker is not null and estrategia is not null
      and accion is not null and precio_usd is not null)
  ),
  -- Nunca guardar la clave.
  constraint alertas_payload_sin_clave check (not (payload ? 'clave'))
);

comment on table public.alertas is
  'Alertas de TradingView (o simuladas) con clave válida. payload sin la clave.';

create index alertas_recibida_en_idx on public.alertas (recibida_en desc);

-- ---------------------------------------------------------------------
-- intentos_rechazados: pedidos al webhook que no llegan a ser alerta.
-- Sin payload (puede traer basura o una clave mal escrita).
-- ---------------------------------------------------------------------
create table public.intentos_rechazados (
  id           bigint generated always as identity primary key,
  recibido_en  timestamptz not null default now(),
  ip           text check (char_length(ip) <= 100),
  motivo       text not null check (motivo in (
                 'clave_invalida',
                 'ip_no_permitida',
                 'mensaje_ilegible',
                 'cuerpo_demasiado_grande'
               ))
);

comment on table public.intentos_rechazados is
  'Pedidos rechazados por el webhook (hora, IP, motivo). Sin payload.';

create index intentos_rechazados_recibido_en_idx
  on public.intentos_rechazados (recibido_en desc);

-- ---------------------------------------------------------------------
-- Permisos. Las tablas nuevas no se exponen solas:
-- - service_role (clave secreta, solo servidor): inserta y lee.
-- - authenticated (panel): solo lee.
-- - anon: nada.
-- ---------------------------------------------------------------------
revoke all on public.alertas, public.intentos_rechazados from public, anon;

grant select, insert on public.alertas to service_role;
grant select, insert on public.intentos_rechazados to service_role;

grant select on public.alertas to authenticated;
grant select on public.intentos_rechazados to authenticated;

-- ---------------------------------------------------------------------
-- RLS: activado. service_role lo saltea por diseño (BYPASSRLS); el
-- usuario logueado solo tiene política de lectura.
-- ---------------------------------------------------------------------
alter table public.alertas enable row level security;
alter table public.intentos_rechazados enable row level security;

create policy "alertas: usuario logueado lee"
  on public.alertas for select to authenticated using (true);

create policy "intentos_rechazados: usuario logueado lee"
  on public.intentos_rechazados for select to authenticated using (true);

commit;
