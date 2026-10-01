-- =====================================================================
-- Migración 4 (F3): filtro de señales, API de EasyTrading y
-- configuración (interruptor de envío, horario, feriados).
-- Correr completo en Supabase → SQL Editor. Es todo-o-nada: si algo
-- falla, no queda nada a medias.
--
-- Las reglas (filtro, tomar, resultado, aviso de corto cerrado) viven en
-- funciones de la base para que sean atómicas: dos alertas iguales que
-- llegan juntas no pueden pasar las dos, y una señal no se puede tomar
-- dos veces. Las llama SOLO el servidor con la clave secreta
-- (service_role). Ver docs/ESPECIFICACION.md §6 y docs/API_EASYTRADING.md.
--
-- Todas reciben p_ahora (por defecto now()) para poder probarlas con
-- cualquier hora; el servidor nunca lo manda.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. alertas: nuevo estado "senal" (pasó el filtro y generó una señal).
--    "recibida" queda para las alertas de F2, que no pasaban por el filtro.
-- ---------------------------------------------------------------------
alter table public.alertas
  drop constraint alertas_estado_check,
  drop constraint alertas_estado_coherente;

alter table public.alertas
  add constraint alertas_estado_check
    check (estado in ('recibida', 'senal', 'descartada')),
  add constraint alertas_estado_coherente check (
    (estado = 'descartada' and motivo is not null) or
    (estado in ('recibida', 'senal') and motivo is null
      and ticker is not null and estrategia is not null
      and accion is not null and precio_usd is not null)
  );

-- Para buscar duplicadas (mismo ticker + estrategia + acción, últimos 30 s).
create index alertas_duplicadas_idx
  on public.alertas (ticker, estrategia, accion, recibida_en desc);

-- ---------------------------------------------------------------------
-- 2. configuracion: una sola fila (id = 1).
--    El envío arranca PAUSADO: se activa a mano desde el panel.
-- ---------------------------------------------------------------------
create table public.configuracion (
  id                   smallint primary key default 1 check (id = 1),
  envio_activado       boolean not null default false,
  envio_cambiado_en    timestamptz not null default now(),
  -- Horario de mercado en hora de Argentina: [apertura, cierre).
  hora_apertura        time not null default '11:00',
  hora_cierre          time not null default '17:00',
  horario_cambiado_en  timestamptz not null default now(),
  -- Última vez que EasyTrading pidió señales (para ver si está conectado).
  easytrading_visto_en timestamptz,
  constraint configuracion_horario_valido check (hora_apertura < hora_cierre)
);

comment on table public.configuracion is
  'Fila única: envío a EasyTrading (interruptor), horario de mercado y última consulta de EasyTrading.';

insert into public.configuracion (id) values (1);

-- ---------------------------------------------------------------------
-- 3. feriados: días sin mercado, cargados a mano.
-- ---------------------------------------------------------------------
create table public.feriados (
  fecha       date primary key,
  descripcion text not null check (char_length(descripcion) between 1 and 100),
  created_at  timestamptz not null default now()
);

comment on table public.feriados is
  'Feriados de mercado (hora Argentina). Las alertas de esos días se descartan.';

-- ---------------------------------------------------------------------
-- 4. senales: una por alerta como máximo (alerta_id único).
--    pendiente → tomada → ejecutada | descartada (lo informa EasyTrading)
--    pendiente → vencida (nadie la tomó en 60 s; nunca se ejecuta)
-- ---------------------------------------------------------------------
create table public.senales (
  id                   bigint generated always as identity primary key,
  alerta_id            bigint not null unique
                       references public.alertas (id) on delete restrict,
  origen               text not null check (origen in ('tradingview', 'simulada')),
  ticker_usa           text not null,
  ticker_byma          text not null check (ticker_byma ~ '^[A-Z0-9]{1,10}$'),
  estrategia           text not null check (estrategia in ('corto', 'intradia')),
  accion               text not null check (accion in ('compra', 'venta')),
  precio_usd           numeric(18, 6) not null check (precio_usd > 0), -- solo registro
  creada_en            timestamptz not null,
  vence_en             timestamptz not null,
  estado               text not null default 'pendiente' check (estado in (
                         'pendiente', 'tomada', 'vencida', 'ejecutada', 'descartada'
                       )),
  tomada_en            timestamptz,

  -- Resultado que informa EasyTrading (la web solo lo guarda y lo muestra).
  resultado_en         timestamptz,
  resultado_precio_ars numeric(18, 6) check (resultado_precio_ars > 0),
  resultado_nominales  integer check (resultado_nominales > 0),
  resultado_modo       text check (resultado_modo in ('PAPER', 'REAL')),
  resultado_motivo     text check (char_length(resultado_motivo) between 1 and 500),

  constraint senales_vence_despues check (vence_en > creada_en),
  constraint senales_estado_coherente check (
    (estado in ('pendiente', 'vencida')
      and tomada_en is null and resultado_en is null
      and resultado_precio_ars is null and resultado_nominales is null
      and resultado_modo is null and resultado_motivo is null) or
    (estado = 'tomada'
      and tomada_en is not null and resultado_en is null
      and resultado_precio_ars is null and resultado_nominales is null
      and resultado_modo is null and resultado_motivo is null) or
    (estado = 'ejecutada'
      and tomada_en is not null and resultado_en is not null
      and resultado_precio_ars is not null and resultado_nominales is not null
      and resultado_modo is not null and resultado_motivo is null) or
    (estado = 'descartada'
      and tomada_en is not null and resultado_en is not null
      and resultado_precio_ars is null and resultado_nominales is null
      and resultado_modo is null and resultado_motivo is not null)
  )
);

comment on table public.senales is
  'Señales para EasyTrading (una por alerta). La web no arma órdenes: solo deja la señal y guarda el resultado.';

create index senales_pendientes_idx on public.senales (vence_en) where estado = 'pendiente';

-- ---------------------------------------------------------------------
-- 5. avisos_easytrading: avisos de posición de CORTO cerrada.
--    Único por (ticker, cierre): si EasyTrading reintenta, no se repite.
-- ---------------------------------------------------------------------
create table public.avisos_easytrading (
  id          bigint generated always as identity primary key,
  recibido_en timestamptz not null default now(),
  ticker_byma text not null check (ticker_byma ~ '^[A-Z0-9]{1,10}$'),
  estrategia  text not null check (estrategia = 'corto'),
  cerrada_en  timestamptz not null,
  senal_id    bigint, -- solo registro: lo que mande EasyTrading
  ticker_usa  text,
  resultado   text not null check (resultado in (
                'destildado', 'ya_destildado', 'no_esta_en_la_lista', 'ticker_desconocido'
              )),
  constraint avisos_easytrading_unico unique (ticker_byma, estrategia, cerrada_en)
);

comment on table public.avisos_easytrading is
  'Avisos de EasyTrading: posición de corto plazo cerrada → se destilda "activo".';

create index avisos_easytrading_recibido_en_idx
  on public.avisos_easytrading (recibido_en desc);

-- ---------------------------------------------------------------------
-- 6. Filtro de señales (docs/ESPECIFICACION.md §6).
--    Guarda la alerta y, si pasa todas las reglas, crea su señal.
--    p_motivo: error de datos ya detectado por el servidor (o null).
--    Devuelve { alerta_id, estado, motivo, senal_id }.
-- ---------------------------------------------------------------------
create function public.registrar_alerta(
  p_origen           text,
  p_payload          jsonb,
  p_ticker           text,
  p_estrategia       text,
  p_accion           text,
  p_precio_usd       numeric,
  p_hora_tv          text,
  p_motivo           text,
  p_enviar_simulada  boolean default false,
  p_ahora            timestamptz default now()
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_local   timestamp := p_ahora at time zone 'America/Argentina/Buenos_Aires';
  v_conf    public.configuracion%rowtype;
  v_feriado text;
  v_dup     bigint;
  v_tildado boolean;
  v_byma    text;
  v_lista   text := case p_estrategia
                      when 'corto' then 'Corto plazo'
                      when 'intradia' then 'Intradía'
                    end;
  v_motivo  text := p_motivo;
  v_estado  text;
  v_alerta  bigint;
  v_senal   bigint;
begin
  if v_motivo is null and (p_ticker is null or p_estrategia is null
                           or p_accion is null or p_precio_usd is null) then
    v_motivo := 'Datos incompletos.';
  end if;

  if v_motivo is null then
    -- Una alerta igual a la vez: la segunda espera y ve a la primera.
    perform pg_advisory_xact_lock(
      hashtextextended('alerta:' || p_ticker || ':' || p_estrategia || ':' || p_accion, 0));

    select * into v_conf from public.configuracion where id = 1;

    if not found then
      v_motivo := 'Falta la configuración (migración 4).';

    -- Horario: hora de llegada al servidor, en Argentina.
    elsif extract(isodow from v_local) in (6, 7) then
      v_motivo := 'Fuera de horario: fin de semana.';
    elsif exists (select 1 from public.feriados f where f.fecha = v_local::date) then
      select f.descripcion into v_feriado from public.feriados f where f.fecha = v_local::date;
      v_motivo := format('Fuera de horario: feriado (%s).', v_feriado);
    elsif v_local::time < v_conf.hora_apertura or v_local::time >= v_conf.hora_cierre then
      v_motivo := format('Fuera de horario: %s (mercado de %s a %s).',
                         to_char(v_local, 'HH24:MI:SS'),
                         to_char(v_conf.hora_apertura, 'HH24:MI'),
                         to_char(v_conf.hora_cierre, 'HH24:MI'));
    end if;

    -- Duplicada: otra igual (con datos válidos) en los últimos 30 s.
    if v_motivo is null then
      select a.id into v_dup
      from public.alertas a
      where a.ticker = p_ticker and a.estrategia = p_estrategia and a.accion = p_accion
        and a.precio_usd is not null
        and a.recibida_en > p_ahora - interval '30 seconds'
      order by a.recibida_en desc
      limit 1;
      if found then
        v_motivo := format('Duplicada: igual a la alerta #%s (menos de 30 s).', v_dup);
      end if;
    end if;

    -- En la lista de esa estrategia; las compras, además, tildadas.
    if v_motivo is null then
      select t.ticker_byma,
             case p_estrategia
               when 'corto' then ac.activo
               else ac.operar_hoy_fecha is not distinct from v_local::date
             end
        into v_byma, v_tildado
      from public.activos ac
      join public.tickers t on t.ticker_usa = ac.ticker_usa
      where ac.ticker_usa = p_ticker and ac.estrategia = p_estrategia;

      if not found then
        v_motivo := format('No está en la lista de %s.', v_lista);
      elsif p_accion = 'compra' and not v_tildado then
        v_motivo := case p_estrategia
                      when 'corto' then 'Compra de un activo sin tildar en Corto plazo.'
                      else 'Compra de un activo sin "operar hoy" en Intradía.'
                    end;
      end if;
    end if;

    if v_motivo is null and not v_conf.envio_activado then
      v_motivo := 'pausado';
    end if;

    if v_motivo is null and p_origen = 'simulada' and not p_enviar_simulada then
      v_motivo := 'Simulada: pasó el filtro, pero no se envió a EasyTrading.';
    end if;
  end if;

  v_estado := case when v_motivo is null then 'senal' else 'descartada' end;

  insert into public.alertas (
    recibida_en, origen, payload, ticker, estrategia, accion, precio_usd, hora_tv, estado, motivo
  ) values (
    p_ahora, p_origen, p_payload, p_ticker, p_estrategia, p_accion, p_precio_usd, p_hora_tv,
    v_estado, left(v_motivo, 500)
  )
  returning id into v_alerta;

  if v_estado = 'senal' then
    insert into public.senales (
      alerta_id, origen, ticker_usa, ticker_byma, estrategia, accion, precio_usd,
      creada_en, vence_en
    ) values (
      v_alerta, p_origen, p_ticker, v_byma, p_estrategia, p_accion, p_precio_usd,
      p_ahora, p_ahora + interval '60 seconds'
    )
    returning id into v_senal;
  end if;

  return jsonb_build_object(
    'alerta_id', v_alerta, 'estado', v_estado, 'motivo', left(v_motivo, 500), 'senal_id', v_senal);
end;
$$;

-- Señal tal como la ve EasyTrading.
create function public.senal_para_easytrading(s public.senales)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'alerta_id', s.alerta_id,
    'origen', s.origen,
    'ticker_byma', s.ticker_byma,
    'ticker_usa', s.ticker_usa,
    'estrategia', s.estrategia,
    'accion', s.accion,
    'precio_usd', s.precio_usd,
    'creada_en', s.creada_en,
    'vence_en', s.vence_en,
    'estado', s.estado
  );
$$;

-- ---------------------------------------------------------------------
-- 7. API de EasyTrading.
-- ---------------------------------------------------------------------

-- GET señales: vence las viejas, anota que EasyTrading está conectado y
-- devuelve las pendientes. En pausa no devuelve nada.
create function public.easytrading_pendientes(p_ahora timestamptz default now())
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_activado boolean;
  v_lista    jsonb;
begin
  update public.senales set estado = 'vencida'
  where estado = 'pendiente' and vence_en <= p_ahora;

  -- Como mucho una escritura cada 5 s, aunque consulte más seguido.
  update public.configuracion set easytrading_visto_en = p_ahora
  where id = 1
    and (easytrading_visto_en is null or easytrading_visto_en < p_ahora - interval '5 seconds');

  select c.envio_activado into v_activado from public.configuracion c where c.id = 1;

  select coalesce(jsonb_agg(public.senal_para_easytrading(s) order by s.id), '[]'::jsonb)
    into v_lista
  from public.senales s
  where coalesce(v_activado, false)
    and s.estado = 'pendiente' and s.vence_en > p_ahora;

  return jsonb_build_object('envio_activado', coalesce(v_activado, false), 'senales', v_lista);
end;
$$;

-- POST tomar: pendiente → tomada, atómico. Si dos la piden a la vez,
-- solo una la consigue.
-- resultado: tomada | no_existe | pausado | no_disponible (+ estado actual)
create function public.easytrading_tomar(p_id bigint, p_ahora timestamptz default now())
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_senal  public.senales%rowtype;
  v_estado text;
begin
  update public.senales set estado = 'vencida'
  where id = p_id and estado = 'pendiente' and vence_en <= p_ahora;

  if not coalesce((select c.envio_activado from public.configuracion c where c.id = 1), false) then
    select s.estado into v_estado from public.senales s where s.id = p_id;
    if not found then
      return jsonb_build_object('resultado', 'no_existe');
    end if;
    return jsonb_build_object('resultado', 'pausado', 'estado', v_estado);
  end if;

  update public.senales set estado = 'tomada', tomada_en = p_ahora
  where id = p_id and estado = 'pendiente' and vence_en > p_ahora
  returning * into v_senal;

  if found then
    return jsonb_build_object(
      'resultado', 'tomada', 'senal', public.senal_para_easytrading(v_senal));
  end if;

  select s.estado into v_estado from public.senales s where s.id = p_id;
  if not found then
    return jsonb_build_object('resultado', 'no_existe');
  end if;
  return jsonb_build_object('resultado', 'no_disponible', 'estado', v_estado);
end;
$$;

-- POST resultado: tomada → ejecutada | descartada. Repetir exactamente el
-- mismo resultado responde ya_registrado (EasyTrading puede reintentar).
-- resultado: registrado | ya_registrado | no_existe | no_disponible
create function public.easytrading_resultado(
  p_id          bigint,
  p_estado      text,
  p_precio_ars  numeric,
  p_nominales   integer,
  p_modo        text,
  p_motivo      text,
  p_ahora       timestamptz default now()
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_senal public.senales%rowtype;
begin
  select * into v_senal from public.senales where id = p_id for update;
  if not found then
    return jsonb_build_object('resultado', 'no_existe');
  end if;

  if v_senal.estado = 'tomada' then
    update public.senales set
      estado = p_estado,
      resultado_en = p_ahora,
      resultado_precio_ars = p_precio_ars,
      resultado_nominales = p_nominales,
      resultado_modo = p_modo,
      resultado_motivo = p_motivo
    where id = p_id;
    return jsonb_build_object('resultado', 'registrado', 'estado', p_estado);
  end if;

  if v_senal.estado = p_estado
     and v_senal.resultado_precio_ars is not distinct from p_precio_ars
     and v_senal.resultado_nominales is not distinct from p_nominales
     and v_senal.resultado_modo is not distinct from p_modo
     and v_senal.resultado_motivo is not distinct from p_motivo then
    return jsonb_build_object('resultado', 'ya_registrado', 'estado', p_estado);
  end if;

  return jsonb_build_object('resultado', 'no_disponible', 'estado', v_senal.estado);
end;
$$;

-- POST posicion-cerrada (solo corto): destilda "activo" y registra el
-- aviso. Idempotente: el mismo aviso (ticker + hora de cierre) repetido
-- no vuelve a destildar (por si Fran lo tildó de nuevo en el medio).
-- resultado: destildado | ya_destildado | no_esta_en_la_lista | ticker_desconocido
create function public.easytrading_posicion_cerrada(
  p_ticker_byma text,
  p_cerrada_en  timestamptz,
  p_senal_id    bigint,
  p_ahora       timestamptz default now()
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_previo    text;
  v_usa       text;
  v_resultado text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('aviso:' || p_ticker_byma || ':' || p_cerrada_en::text, 0));

  select a.resultado into v_previo
  from public.avisos_easytrading a
  where a.ticker_byma = p_ticker_byma and a.estrategia = 'corto' and a.cerrada_en = p_cerrada_en;
  if found then
    return jsonb_build_object('resultado', v_previo, 'repetido', true);
  end if;

  select t.ticker_usa into v_usa from public.tickers t where t.ticker_byma = p_ticker_byma;

  if not found then
    v_resultado := 'ticker_desconocido';
  else
    update public.activos set activo = false
    where ticker_usa = v_usa and estrategia = 'corto' and activo;
    if found then
      v_resultado := 'destildado';
    elsif exists (select 1 from public.activos ac
                  where ac.ticker_usa = v_usa and ac.estrategia = 'corto') then
      v_resultado := 'ya_destildado';
    else
      v_resultado := 'no_esta_en_la_lista';
    end if;
  end if;

  insert into public.avisos_easytrading (
    recibido_en, ticker_byma, estrategia, cerrada_en, senal_id, ticker_usa, resultado
  ) values (
    p_ahora, p_ticker_byma, 'corto', p_cerrada_en, p_senal_id, v_usa, v_resultado
  );

  return jsonb_build_object('resultado', v_resultado, 'repetido', false);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Permisos. Las tablas nuevas no se exponen solas:
-- - service_role (clave secreta, solo servidor): webhook, simulador y
--   API de EasyTrading, a través de las funciones de arriba.
-- - authenticated (panel): lee todo; cambia el interruptor y el horario;
--   carga y borra feriados.
-- - anon: nada.
-- ---------------------------------------------------------------------
-- Primero se saca todo (también lo que pudiera venir por defecto) y
-- después se da solo lo necesario.
revoke all on public.configuracion, public.feriados, public.senales, public.avisos_easytrading
  from public, anon, authenticated, service_role;

-- Lo que leen / escriben las funciones (son security invoker: corren con
-- los permisos de quien las llama).
grant select on public.tickers, public.activos to service_role;
grant update (activo) on public.activos to service_role;
grant select on public.feriados to service_role;
grant select, update (easytrading_visto_en) on public.configuracion to service_role;
grant select, insert, update on public.senales to service_role;
grant select, insert on public.avisos_easytrading to service_role;

grant select on public.configuracion, public.feriados, public.senales, public.avisos_easytrading
  to authenticated;
grant update (envio_activado, envio_cambiado_en, hora_apertura, hora_cierre, horario_cambiado_en)
  on public.configuracion to authenticated;
grant insert, delete on public.feriados to authenticated;

-- Las funciones: solo el servidor.
revoke execute on function
  public.registrar_alerta(text, jsonb, text, text, text, numeric, text, text, boolean, timestamptz),
  public.senal_para_easytrading(public.senales),
  public.easytrading_pendientes(timestamptz),
  public.easytrading_tomar(bigint, timestamptz),
  public.easytrading_resultado(bigint, text, numeric, integer, text, text, timestamptz),
  public.easytrading_posicion_cerrada(text, timestamptz, bigint, timestamptz)
  from public, anon, authenticated;

grant execute on function
  public.registrar_alerta(text, jsonb, text, text, text, numeric, text, text, boolean, timestamptz),
  public.senal_para_easytrading(public.senales),
  public.easytrading_pendientes(timestamptz),
  public.easytrading_tomar(bigint, timestamptz),
  public.easytrading_resultado(bigint, text, numeric, integer, text, text, timestamptz),
  public.easytrading_posicion_cerrada(text, timestamptz, bigint, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------
-- 9. RLS: activado. service_role lo saltea por diseño (BYPASSRLS).
-- ---------------------------------------------------------------------
alter table public.configuracion enable row level security;
alter table public.feriados enable row level security;
alter table public.senales enable row level security;
alter table public.avisos_easytrading enable row level security;

create policy "configuracion: usuario logueado lee"
  on public.configuracion for select to authenticated using (true);
create policy "configuracion: usuario logueado edita"
  on public.configuracion for update to authenticated using (true) with check (true);

create policy "feriados: usuario logueado lee"
  on public.feriados for select to authenticated using (true);
create policy "feriados: usuario logueado crea"
  on public.feriados for insert to authenticated with check (true);
create policy "feriados: usuario logueado borra"
  on public.feriados for delete to authenticated using (true);

create policy "senales: usuario logueado lee"
  on public.senales for select to authenticated using (true);

create policy "avisos_easytrading: usuario logueado lee"
  on public.avisos_easytrading for select to authenticated using (true);

commit;
