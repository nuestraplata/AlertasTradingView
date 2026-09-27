-- =====================================================================
-- Paso 4 (F1): tablas tickers y activos
-- Correr completo en Supabase → SQL Editor. Es todo-o-nada: si algo
-- falla, no queda nada a medias.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Función común: mantiene updated_at al día en cada UPDATE.
-- ---------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- tickers: mapeo ticker USA (TradingView) → CEDEAR en BYMA.
-- Compartido por las listas de corto plazo e intradía.
-- ---------------------------------------------------------------------
create table public.tickers (
  ticker_usa  text primary key
              check (ticker_usa ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$'),
  ticker_byma text not null unique
              check (ticker_byma ~ '^[A-Z0-9]{1,10}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.tickers is
  'Mapeo ticker USA (TradingView) → CEDEAR BYMA (ARS, 24hs, sin sufijo).';

create trigger tickers_updated_at
  before update on public.tickers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- activos: configuración por (ticker_usa, estrategia).
-- ---------------------------------------------------------------------
create table public.activos (
  id               bigint generated always as identity primary key,
  ticker_usa       text not null
                   references public.tickers (ticker_usa)
                   on update cascade on delete restrict,
  estrategia       text not null check (estrategia in ('corto', 'intradia')),

  nominales        integer not null check (nominales > 0),
  -- Si no se manda, el trigger lo completa con 3 × nominales.
  nominales_max    integer not null,

  entrada_usd      numeric(18, 6) check (entrada_usd > 0), -- anotación
  tp_usd           numeric(18, 6) check (tp_usd > 0),      -- anotación
  sl_usd           numeric(18, 6) check (sl_usd > 0),

  onda             text check (char_length(onda) <= 50),
  sub_onda         text check (char_length(sub_onda) <= 50),
  notas            text check (char_length(notas) <= 2000),

  modo             text not null default 'PAPER' check (modo in ('PAPER', 'REAL')),

  -- Corto plazo: tilde "activo".
  activo           boolean not null default false,
  -- Intradía: "operar hoy" vale solo si esta fecha es hoy (hora Argentina).
  operar_hoy_fecha date,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint activos_ticker_estrategia_unico unique (ticker_usa, estrategia),

  constraint activos_nominales_max_valido check (nominales_max >= nominales),

  -- SL < entrada, solo si hay entrada cargada.
  constraint activos_sl_menor_entrada
    check (entrada_usd is null or sl_usd is null or sl_usd < entrada_usd),

  -- Cada tilde corresponde a su estrategia.
  constraint activos_tilde_segun_estrategia check (
    (estrategia = 'corto'    and operar_hoy_fecha is null) or
    (estrategia = 'intradia' and activo = false)
  ),

  -- Sin SL no se puede tildar (no habría protección local).
  constraint activos_tilde_requiere_sl check (
    sl_usd is not null or (activo = false and operar_hoy_fecha is null)
  )
);

comment on table public.activos is
  'Configuración por activo y estrategia (corto / intradia).';

create function public.activos_nominales_max_por_defecto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.nominales_max is null then
    new.nominales_max := new.nominales * 3;
  end if;
  return new;
end;
$$;

create trigger activos_nominales_max_por_defecto
  before insert on public.activos
  for each row execute function public.activos_nominales_max_por_defecto();

create trigger activos_updated_at
  before update on public.activos
  for each row execute function public.set_updated_at();

create index activos_estrategia_idx on public.activos (estrategia);

-- ---------------------------------------------------------------------
-- Permisos. Las tablas nuevas no se exponen solas: se da acceso
-- explícito SOLO al usuario logueado (rol authenticated). anon (sin
-- login) no puede ni leer.
-- ---------------------------------------------------------------------
revoke all on public.tickers, public.activos from public, anon;

grant select, insert, update, delete on public.tickers to authenticated;
grant select, insert, update, delete on public.activos to authenticated;

-- Las funciones de trigger no las llama nadie directamente.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.activos_nominales_max_por_defecto() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS: activado y con políticas solo para authenticated. Como el
-- registro público está desactivado, el único usuario es Fran.
-- ---------------------------------------------------------------------
alter table public.tickers enable row level security;
alter table public.activos enable row level security;

create policy "tickers: usuario logueado lee"
  on public.tickers for select to authenticated using (true);
create policy "tickers: usuario logueado crea"
  on public.tickers for insert to authenticated with check (true);
create policy "tickers: usuario logueado edita"
  on public.tickers for update to authenticated using (true) with check (true);
create policy "tickers: usuario logueado borra"
  on public.tickers for delete to authenticated using (true);

create policy "activos: usuario logueado lee"
  on public.activos for select to authenticated using (true);
create policy "activos: usuario logueado crea"
  on public.activos for insert to authenticated with check (true);
create policy "activos: usuario logueado edita"
  on public.activos for update to authenticated using (true) with check (true);
create policy "activos: usuario logueado borra"
  on public.activos for delete to authenticated using (true);

commit;
