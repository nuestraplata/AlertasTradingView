-- =====================================================================
-- Migración 2 (F1): activos queda solo con tilde y anotaciones.
-- Nominales, tope, stop, TP y modo pasan a EasyTrading (ver
-- docs/ESPECIFICACION.md §5 y §7).
-- Correr completo en Supabase → SQL Editor. Es todo-o-nada: si algo
-- falla, no queda nada a medias.
-- =====================================================================

begin;

-- 1. Restricciones que dependen de más de una columna a eliminar.
alter table public.activos
  drop constraint activos_tilde_requiere_sl,
  drop constraint activos_sl_menor_entrada,
  drop constraint activos_nominales_max_valido;

-- 2. Trigger que completaba nominales_max = 3 × nominales, y su función.
drop trigger activos_nominales_max_por_defecto on public.activos;
drop function public.activos_nominales_max_por_defecto();

-- 3. Columnas que ya no usa la web. Sus restricciones propias
--    (nominales > 0, modo PAPER/REAL, precios > 0) se van con ellas.
alter table public.activos
  drop column nominales,
  drop column nominales_max,
  drop column entrada_usd,
  drop column tp_usd,
  drop column sl_usd,
  drop column modo;

-- Siguen igual: único (ticker_usa, estrategia), relación con tickers,
-- "tilde según estrategia", límites de onda / sub_onda / notas,
-- updated_at, permisos (GRANT) y RLS con sus políticas.

commit;
