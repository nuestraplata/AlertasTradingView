# ESPECIFICACIÓN — "Alertas TradingView"

## 1. Qué es

Web en la nube que recibe alertas de TradingView (webhook), las guarda
clasificadas por tipo y, según la configuración de cada activo, genera
órdenes que EasyTrading (PC local) busca y ejecuta en Cocos Capital.
La PC nunca se expone a internet: EasyTrading CONSULTA a la web (pull).
Cripto (BingX/Binance) queda para una fase posterior, separada.

## 2. Stack

- Next.js + Supabase (Postgres) + Vercel, planes gratuitos.
- Repo nuevo y PRIVADO, separado de EasyTrading.
- Región: Supabase y funciones de Vercel en São Paulo (gru1) por latencia.
- Login single-user obligatorio para toda la web (excepto el webhook).
  Supabase Auth con email + contraseña, sin registro público (el usuario
  se crea a mano en Supabase).
- Secretos en variables de entorno, nunca en el código.
- Supabase: las tablas nuevas NO se exponen automáticamente y RLS está
  activo por defecto. Toda migración incluye GRANT explícitos para los roles
  que la necesitan, además de las políticas RLS. Las migraciones las corre
  Fran en el SQL Editor de Supabase.
- Fechas y horarios de negocio siempre en hora de Argentina
  (America/Argentina/Buenos_Aires).

## 3. Piezas

1. Webhook (POST): recibe la alerta de TradingView, valida la clave,
   la guarda y responde rápido (TradingView corta a los ~3 s).
2. Motor de reglas (en la web): cruza la alerta con la configuración
   y crea (o no) una orden pendiente, registrando el motivo.
3. API para EasyTrading (protegida con token propio):
   - GET órdenes pendientes
   - POST "tomar" orden (atómico: pendiente → tomada; si ya fue tomada, falla)
   - POST resultado (ejecutada / parcial / rechazada + precio y nominales)
   - POST estado de posiciones (para mostrarlas en la web)
4. Panel web: configuración de listas, alertas por tipo, órdenes, posiciones.
5. Módulo puente en EasyTrading (se hace en el repo de EasyTrading, aparte).

## 4. Formato de alerta (campo "Mensaje" de TradingView)

```
{
  "clave": "CLAVE_SECRETA",
  "estrategia": "corto" | "intradia",
  "accion": "compra" | "venta" | "sl" | "tp",
  "ticker": "{{ticker}}",
  "precio": "{{close}}",
  "hora": "{{timenow}}"
}
```

- Clave inválida → rechazar, no genera nada. Se registra solo el intento
  (hora e IP), sin guardar el payload.
- Todas las alertas válidas se guardan, incluso las descartadas, con motivo.
- Clave correcta pero datos inválidos (estrategia, accion, ticker o precio
  mal formados) → se guarda como descartada, con motivo.
- El webhook acepta el cuerpo como application/json o text/plain
  (TradingView manda text/plain si el mensaje no es JSON válido).
  "precio" llega como texto y se convierte a número.

## 5. Configuración de activos (acciones)

Dos listas separadas: CORTO PLAZO e INTRADÍA.
Un mismo ticker PUEDE estar en ambas; son posiciones independientes.
Clave única: (ticker_usa, estrategia).

Campos por activo:

- ticker_usa (el de TradingView) y ticker_byma (CEDEAR). Mapeo manual
  porque pueden no coincidir. El mapeo vive en una tabla aparte "tickers"
  (ticker_usa → ticker_byma), compartida por las dos listas: se carga una
  sola vez por ticker.
- Siempre se opera el CEDEAR en ARS, plazo 24hs (el ticker sin sufijo,
  compatible con Instrumento.ticker de EasyTrading).
- nominales (fijos, editables en cualquier momento)
- nominales_max: tope de la posición abierta. Por defecto 3 × nominales,
  editable.
- sl_usd (cargado sobre el gráfico USA). OBLIGATORIO para poder tildar
  "activo" u "operar hoy" (sin SL no hay protección local).
- entrada_usd, tp_usd (cargados sobre el gráfico USA): solo anotación,
  opcionales. Si hay entrada_usd cargada, se valida sl_usd < entrada_usd.
- onda, sub_onda, notas (solo anotación, no afectan ninguna regla)
- modo: PAPER | REAL (por defecto PAPER)
- Corto plazo: tilde "activo".
- Intradía: tilde "operar hoy", que se destilda solo al empezar cada día.
  Se guarda como operar_hoy_fecha: el tilde cuenta como marcado solo si esa
  fecha es hoy (hora de Argentina). No hace falta cron.

## 6. Reglas de negocio

Generales:

- Alertas fuera del horario de mercado (configurable) → se descartan.
  Se usa la hora de llegada al servidor (hora de Argentina), no la "hora"
  de la alerta. También se descartan fines de semana y feriados; los
  feriados están en una tabla que Fran carga a mano.
- Ticker no configurado para esa estrategia → se descarta.
- Una alerta genera como máximo UNA orden (idempotencia por alerta).
- Antiduplicado: una alerta idéntica (mismo ticker + estrategia + accion) a
  otra recibida en los últimos 30 s → se descarta con motivo.
- Toda orden vence a los 60 s si EasyTrading no la tomó → "vencida",
  no se ejecuta nunca después.
- Nunca vender más nominales de los que hay abiertos en esa estrategia.
  Si la posición ya está cerrada (por ejemplo, el SL local ganó de mano a la
  alerta), la venta se descarta.
- Compra con posición abierta → se suma (se promedia).
- Compra que haría superar nominales_max → se descarta con motivo.
- Resultado parcial:
  - Compra parcial: se cancela el resto y la posición queda con lo ejecutado.
  - Venta parcial: EasyTrading reintenta hasta cerrar la posición (se define
    en sus fases).

Corto plazo:

- Compra: solo si el activo está tildado "activo".
- Venta / TP / SL: vende TODA la posición de corto plazo de ese activo.
  - Etapa inicial: la posición abierta por la app.
  - Futuro, cuando EasyTrading tenga la "Tenencia real del broker
    (F4 de EasyTrading)":
    tenencia total del broker MENOS la posición intradía abierta.

Intradía:

- Compra: solo si está tildado "operar hoy".
- Venta / TP / SL: vende solo la posición intradía, esté o no tildado hoy.
  El tilde solo habilita compras.
- Si al cierre queda posición abierta, se mantiene hasta la alerta de venta
  o el cierre manual.

## 7. Stop loss local (lo vigila EasyTrading)

Protección ante caída de conexión o alerta perdida.

- Los niveles USD se traducen a ARS por PORCENTAJE:
  sl_ars = ppc_ars × (sl_usd / ppc_usd)
  - ppc_usd = promedio ponderado del "precio" de las alertas de compra.
  - ppc_ars = precio promedio real del CEDEAR comprado.
- Si Fran edita sl_usd en la web, se recalcula en las posiciones abiertas.
- EasyTrading vende la posición si el bid ≤ sl_ars.
- El TP lo dispara solo la alerta de TradingView (no hay TP local por ahora).

## 8. Ejecución en EasyTrading

- "A mercado" = Intencion.LIMITE cruzando el spread (compra al ask,
  vende al bid).
- El tope de nominales por instrumento de EasyTrading debe ser ≥ a los
  nominales configurados en la web; si no, la orden se rechaza y se reporta.
- Doble candado: se opera REAL solo si el activo está en REAL en la web Y
  EJECUCION_REAL=true en el motor. En cualquier otro caso → PAPER.
- PAPER: simula el fill al precio real del momento (ask/bid), registra la
  operación con dinero ficticio y reporta igual que una real.
- EasyTrading guarda el ID de orden de la web: al reconectar, NUNCA
  re-ejecuta una orden ya tomada (verifica estado antes de operar).
- El CEDEAR tiene que estar suscripto en el motor (en_watchlist) para
  tener precios; respetar SUSCRIPCION_LIMITE.
- El polling va por HTTPS a la web: NO consume getToken ni WebSocket de
  Primary (límites de 1/día intactos).

## 9. Tablas (orientativo)

tickers (ticker_usa → ticker_byma), activos, alertas (payload crudo + tipo
+ estado + motivo), intentos_rechazados (hora, IP; sin payload), ordenes
(alerta_id único, estado, vence_en, resultado), posiciones (por activo y
estrategia: nominales, ppc_ars, ppc_usd, sl_ars, fecha apertura),
configuracion (horario, vencimiento), feriados (fecha, descripción).
Cripto: tablas propias en su fase.

## 10. Fases (validar cada una antes de seguir)

WEB:

- F1: proyecto, login, listas corto/intradía (CRUD), mapeo de tickers.
- F2: webhook + registro de alertas + vista por tipo + botón
  "simular alerta" para probar sin TradingView. No genera órdenes.
  Incluye un cron diario de Vercel que hace una consulta mínima a Supabase
  para evitar que el plan Free pause el proyecto por inactividad.
- F3: motor de reglas + órdenes pendientes + vencimiento + API EasyTrading.
  - Botón "Pausar todo": interruptor general, visible en todas las
    pantallas, que bloquea al instante la generación de órdenes (las
    alertas se siguen guardando, descartadas con motivo "pausado").
  - No se puede borrar un activo con posición abierta.

EASYTRADING (en su propio repo):

- F4: módulo puente (pull, tomar, reportar) solo en PAPER.
- F5: posiciones + SL local, en PAPER.
- F6: REAL con doble candado, 1 nominal primero, después montos chicos.

LUEGO:

- F7: cripto (ejecutor en la nube hacia BingX/Binance; ojo, Binance bloquea
  IPs de EE.UU.).
- F8: venta de tenencia real del broker. Depende de la "Tenencia real del
  broker (F4 de EasyTrading)".

## 11. Reglas de trabajo con Claude Code

- Rama de desarrollo, nunca main. git add con rutas explícitas.
  git log después de cada commit. Nada de push/deploy sin aprobación.
- Protocolo en dos fases: CC investiga y propone → Fran aprueba → CC implementa.
- CC no toca .env ni ejecuta la app; lo hace Fran.
- Tests verdes antes de cada commit.
