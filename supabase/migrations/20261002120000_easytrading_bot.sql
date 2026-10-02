-- =====================================================================
-- Migración 5 (F3): EasyTrading se conecta DIRECTO a Postgres (pooler de
-- Supabase) con su propio rol, en lugar de llamar a una API HTTP en
-- Vercel (consultar cada pocos segundos podía agotar la CPU del plan
-- Hobby y tirar también el webhook).
-- Correr completo en Supabase → SQL Editor, DESPUÉS de la migración 4.
-- Es todo-o-nada: si algo falla, no queda nada a medias.
--
-- - Rol easytrading_bot: NOLOGIN y sin contraseña. El LOGIN y la
--   contraseña los carga Fran a mano después (ver README).
-- - easytrading_bot SOLO puede ejecutar 4 funciones de entrada:
--   easytrading_pendientes, easytrading_tomar, easytrading_resultado y
--   easytrading_posicion_cerrada. Ninguna tabla, nada más.
-- - Las funciones de entrada usan la hora del servidor (now()); las
--   versiones con p_ahora quedan en el esquema "interno", sin acceso para
--   nadie salvo el dueño.
-- - Duplicadas: una alerta simulada ya no bloquea a una real.
-- Contrato completo: docs/API_EASYTRADING.md.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Rol de EasyTrading. Pocas conexiones y consultas cortas.
-- ---------------------------------------------------------------------
create role easytrading_bot nologin noinherit connection limit 3;
comment on role easytrading_bot is
  'EasyTrading (PC local): solo ejecuta las 4 funciones de entrada easytrading_*.';
alter role easytrading_bot set statement_timeout = '5s';
alter role easytrading_bot set idle_in_transaction_session_timeout = '30s';

-- ---------------------------------------------------------------------
-- 2. Duplicadas: una simulada solo cuenta contra otras simuladas.
--    Misma firma que en la migración 4: se reemplaza y conserva permisos.
-- ---------------------------------------------------------------------
create or replace function public.registrar_alerta(
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
    -- (Cambio de la migración 5: las simuladas no bloquean a las reales.)
    if v_motivo is null then
      select a.id into v_dup
      from public.alertas a
      where a.ticker = p_ticker and a.estrategia = p_estrategia and a.accion = p_accion
        and a.precio_usd is not null
        and a.recibida_en > p_ahora - interval '30 seconds'
        -- Una simulada solo bloquea a otra simulada; una real bloquea a todas.
        and (a.origen = 'tradingview' or p_origen = 'simulada')
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

-- ---------------------------------------------------------------------
-- 3. Versiones internas (con p_ahora, para probarlas a cualquier hora):
--    las de la migración 4 se mueven al esquema "interno" y se renombran.
--    Nadie las puede llamar salvo el dueño (postgres), es decir, las
--    funciones de entrada de abajo.
-- ---------------------------------------------------------------------
create schema interno;
comment on schema interno is
  'Funciones internas (con p_ahora). Solo las usan las funciones de entrada de EasyTrading.';
revoke all on schema interno from public, anon, authenticated, service_role;

alter function public.easytrading_pendientes(timestamptz) set schema interno;
alter function public.easytrading_tomar(bigint, timestamptz) set schema interno;
alter function public.easytrading_resultado(bigint, text, numeric, integer, text, text, timestamptz)
  set schema interno;
alter function public.easytrading_posicion_cerrada(text, timestamptz, bigint, timestamptz)
  set schema interno;

alter function interno.easytrading_pendientes(timestamptz) rename to pendientes;
alter function interno.easytrading_tomar(bigint, timestamptz) rename to tomar;
alter function interno.easytrading_resultado(bigint, text, numeric, integer, text, text, timestamptz)
  rename to resultado;
alter function interno.easytrading_posicion_cerrada(text, timestamptz, bigint, timestamptz)
  rename to posicion_cerrada;

revoke all on function
  interno.pendientes(timestamptz),
  interno.tomar(bigint, timestamptz),
  interno.resultado(bigint, text, numeric, integer, text, text, timestamptz),
  interno.posicion_cerrada(text, timestamptz, bigint, timestamptz)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Funciones de entrada para EasyTrading (lo ÚNICO que puede usar
--    easytrading_bot). SECURITY DEFINER: corren con los permisos del
--    dueño (postgres), así el rol no necesita acceso a ninguna tabla.
--    search_path vacío: todo va con el esquema escrito, nadie puede
--    colar una tabla o función con el mismo nombre.
--    No aceptan p_ahora: la hora es la del servidor (now()).
--    Validan todos los parámetros y devuelven jsonb; nunca arman SQL
--    dinámico con lo que reciben.
-- ---------------------------------------------------------------------

-- Señales pendientes. Además vence las de más de 60 s y anota la hora de
-- la consulta (el panel muestra si EasyTrading está conectado).
create function public.easytrading_pendientes()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select interno.pendientes(now());
$$;

-- Tomar una señal (pendiente → tomada, atómico).
create function public.easytrading_tomar(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_id is null or p_id <= 0 then
    return jsonb_build_object('resultado', 'datos_invalidos', 'detalle', 'p_id tiene que ser un entero positivo.');
  end if;
  return interno.tomar(p_id, now());
end;
$$;

-- Resultado de una señal tomada: ejecutada (precio ARS, nominales, modo)
-- o descartada (motivo).
create function public.easytrading_resultado(
  p_id          bigint,
  p_estado      text,
  p_precio_ars  numeric,
  p_nominales   integer,
  p_modo        text,
  p_motivo      text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := nullif(btrim(p_motivo), '');
  v_error  text;
begin
  if p_id is null or p_id <= 0 then
    v_error := 'p_id tiene que ser un entero positivo.';
  elsif p_estado = 'ejecutada' then
    if p_precio_ars is null or p_precio_ars <= 0 or p_precio_ars >= 1e12 then
      v_error := 'p_precio_ars tiene que ser mayor que 0.';
    elsif p_nominales is null or p_nominales <= 0 then
      v_error := 'p_nominales tiene que ser un entero mayor que 0.';
    elsif p_modo is null or p_modo not in ('PAPER', 'REAL') then
      v_error := 'p_modo tiene que ser PAPER o REAL.';
    elsif v_motivo is not null then
      v_error := 'p_motivo va solo con estado descartada.';
    end if;
  elsif p_estado = 'descartada' then
    if v_motivo is null or char_length(v_motivo) > 500 then
      v_error := 'p_motivo es obligatorio (1 a 500 caracteres).';
    elsif p_precio_ars is not null or p_nominales is not null or p_modo is not null then
      v_error := 'p_precio_ars, p_nominales y p_modo van solo con estado ejecutada.';
    end if;
  else
    v_error := 'p_estado tiene que ser ejecutada o descartada.';
  end if;

  if v_error is not null then
    return jsonb_build_object('resultado', 'datos_invalidos', 'detalle', v_error);
  end if;

  return interno.resultado(p_id, p_estado, p_precio_ars, p_nominales, p_modo, v_motivo, now());
end;
$$;

-- Se cerró TODA una posición de corto: destilda "activo" en corto.
create function public.easytrading_posicion_cerrada(
  p_ticker_byma text,
  p_estrategia  text,
  p_cerrada_en  timestamptz,
  p_senal_id    bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticker text := upper(btrim(p_ticker_byma));
  v_error  text;
begin
  if v_ticker is null or v_ticker !~ '^[A-Z0-9]{1,10}$' then
    v_error := 'p_ticker_byma: CEDEAR sin sufijo, solo letras y números (máx. 10).';
  elsif p_estrategia is distinct from 'corto' then
    v_error := 'p_estrategia tiene que ser corto (intradía no se avisa).';
  elsif p_cerrada_en is null then
    v_error := 'p_cerrada_en es obligatoria.';
  elsif p_cerrada_en > now() + interval '5 minutes' then
    v_error := 'p_cerrada_en está en el futuro.';
  elsif p_senal_id is not null and p_senal_id <= 0 then
    v_error := 'p_senal_id tiene que ser un entero positivo (o null).';
  end if;

  if v_error is not null then
    return jsonb_build_object('resultado', 'datos_invalidos', 'detalle', v_error);
  end if;

  return interno.posicion_cerrada(v_ticker, p_cerrada_en, p_senal_id, now());
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Permisos.
-- ---------------------------------------------------------------------

-- Las 4 funciones de entrada: SOLO easytrading_bot.
revoke all on function
  public.easytrading_pendientes(),
  public.easytrading_tomar(bigint),
  public.easytrading_resultado(bigint, text, numeric, integer, text, text),
  public.easytrading_posicion_cerrada(text, text, timestamptz, bigint)
  from public, anon, authenticated, service_role;


-- easytrading_bot: nada más. No tiene permisos propios sobre tablas ni
-- secuencias; lo que reciba por PUBLIC en funciones de "public" se saca
-- (las de la app ya lo tenían sacado; esto cubre cualquier otra).
revoke all on all tables in schema public from easytrading_bot;
revoke all on all sequences in schema public from easytrading_bot;
revoke all on all functions in schema public from easytrading_bot;
grant execute on function
  public.easytrading_pendientes(),
  public.easytrading_tomar(bigint),
  public.easytrading_resultado(bigint, text, numeric, integer, text, text),
  public.easytrading_posicion_cerrada(text, text, timestamptz, bigint)
  to easytrading_bot;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname not in ('easytrading_pendientes', 'easytrading_tomar',
                            'easytrading_resultado', 'easytrading_posicion_cerrada')
      and has_function_privilege('easytrading_bot', p.oid, 'EXECUTE')
  loop
    raise notice 'Se saca EXECUTE de PUBLIC en %', f.firma;
    execute format('revoke execute on function %s from public', f.firma);
  end loop;
end;
$$;

-- Las funciones que se creen después en "public" no quedan abiertas a
-- PUBLIC (cada migración da sus permisos explícitos, como siempre).
alter default privileges in schema public revoke execute on functions from public;

-- service_role ya no atiende a EasyTrading (no hay API HTTP): se le saca
-- lo que solo usaba esa API. Conserva lo del webhook (registrar_alerta).
revoke update on public.senales from service_role;
revoke update (activo) on public.activos from service_role;
revoke update (easytrading_visto_en) on public.configuracion from service_role;
revoke all on public.avisos_easytrading from service_role;
revoke execute on function public.senal_para_easytrading(public.senales) from service_role;

commit;
