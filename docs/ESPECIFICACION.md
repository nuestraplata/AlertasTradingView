# ESPECIFICACIÓN — "Alertas TradingView"

## 1. Qué es

Web en la nube que recibe TODAS las alertas de TradingView (webhook), las
registra y, si el activo está tildado en su estrategia y el envío está
activado, las pasa como SEÑAL a EasyTrading (PC local). EasyTrading decide
con su propia configuración si opera y cómo, ejecuta en Cocos Capital y
devuelve el resultado, que la web muestra junto a la alerta.
La PC nunca se expone a internet: EasyTrading CONSULTA a la web (pull).
Cripto (BingX/Binance) queda para una fase posterior, separada.

La web NO arma órdenes, NO guarda posiciones y NO calcula resultados:
eso es responsabilidad de EasyTrading (sección 7).

## 2. Stack

- Next.js + Supabase (Postgres) + Vercel, planes gratuitos.
- Repo nuevo y PRIVADO, separado de EasyTrading.
- Región: Supabase y funciones de Vercel en São Paulo (gru1) por latencia.
- Login single-user obligatorio para toda la web (excepto el webhook y la
  API de EasyTrading, que tienen su propia autenticación).
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
2. Filtro de señales (en la web): decide si la alerta pasa a EasyTrading
   como señal pendiente o se descarta, siempre registrando el motivo.
3. API para EasyTrading (protegida con token propio):
   - GET señales pendientes
   - POST "tomar" señal (atómico: pendiente → tomada; si ya fue tomada, falla)
   - POST resultado de la señal: ejecutada (precio y nominales) o
     descartada por EasyTrading (con motivo)
   - POST aviso de posición de CORTO cerrada (sección 8)
4. Panel web: listas corto/intradía (tildes y anotaciones), tickers,
   alertas con su estado y el resultado de EasyTrading, interruptor
   "Envío a EasyTrading".
5. Módulo puente en EasyTrading (se hace en el repo de EasyTrading, aparte).

## 4. Formato de alerta (campo "Mensaje" de TradingView)

```
{
  "clave": "CLAVE_SECRETA",
  "estrategia": "corto" | "intradia",
  "accion": "compra" | "venta",
  "ticker": "{{ticker}}",
  "precio": "{{close}}",
  "hora": "{{timenow}}"
}
```

- Clave inválida → rechazar, no genera nada. Se registra solo el intento
  (hora e IP), sin guardar el payload.
- En producción, además de la clave, solo se aceptan pedidos desde las IPs
  oficiales de TradingView (lista en lib/alertas/ip.ts, verificada contra
  su documentación). Otra IP → intento rechazado "ip_no_permitida". En
  local y en los previews no se filtra por IP.
- El ticker se guarda sin prefijo de mercado ("NASDAQ:AAPL" → "AAPL").
- Todas las alertas con clave válida se guardan (hora, ticker, precio USD,
  acción, estado, motivo), incluso las descartadas.
- Clave correcta pero datos inválidos (estrategia, accion, ticker o precio
  mal formados) → se guarda como descartada, con motivo. Cualquier accion
  que no sea "compra" o "venta" (por ejemplo los viejos "sl" / "tp") se
  descarta con motivo.
- "precio" ({{close}}) es el precio en USD del gráfico de TradingView. Es
  solo registro: se guarda y se pasa en la señal, pero la web no calcula
  nada con él.
- El webhook acepta el cuerpo como application/json o text/plain
  (TradingView manda text/plain si el mensaje no es JSON válido).
  "precio" llega como texto y se convierte a número.

## 5. Configuración de activos en la web

Dos listas separadas: CORTO PLAZO e INTRADÍA.
Un mismo ticker PUEDE estar en ambas; son independientes.
Clave única: (ticker_usa, estrategia).

Por activo, la web guarda SOLO:

- ticker_usa (el de TradingView). El CEDEAR (ticker_byma) sale del mapeo
  en la tabla aparte "tickers" (ticker_usa → ticker_byma), compartida por
  las dos listas y cargada a mano porque pueden no coincidir. El CEDEAR va
  sin sufijo (compatible con Instrumento.ticker de EasyTrading).
- Tilde:
  - Corto plazo: "activo".
  - Intradía: "operar hoy", que se destilda solo al empezar cada día. Se
    guarda como operar_hoy_fecha: el tilde cuenta como marcado solo si esa
    fecha es hoy (hora de Argentina). No hace falta cron.
- onda, sub_onda, notas (solo anotación, no afectan ninguna regla).

Borrar un activo de una lista: la confirmación avisa "Si EasyTrading tiene
una posición abierta de este activo, sus alertas de venta dejarán de
llegar. ¿Borrar igual?" (la web no sabe de posiciones).

Nominales, tope, stop, TP, trailing y modo PAPER/REAL NO están en la web:
los configura EasyTrading (sección 7).

## 6. Reglas de la web (filtro de señales)

Toda alerta con clave válida se guarda. Pasa a EasyTrading como señal
SOLO si se cumple todo lo siguiente; si no, queda descartada con el motivo
del primer punto que falle:

- Datos válidos (sección 4).
- Dentro del horario de mercado (configurable). Se usa la hora de llegada
  al servidor (hora de Argentina), no la "hora" de la alerta. Fines de
  semana y feriados se descartan; los feriados están en una tabla que Fran
  carga a mano.
- No es duplicada: una alerta idéntica (mismo ticker + estrategia + accion)
  a otra recibida en los últimos 30 s → descartada.
- El ticker está en la lista de esa estrategia.
- Solo COMPRAS: el activo está tildado en esa estrategia (corto: "activo";
  intradía: "operar hoy" de hoy). El tilde nunca filtra ventas: una venta
  pasa aunque el activo esté destildado (por ejemplo, una posición de
  intradía que quedó abierta de un día para otro). Si no hay nada
  abierto, EasyTrading responde "sin posición abierta".
- Interruptor "Envío a EasyTrading" ACTIVADO. En pausa → descartada con
  motivo "pausado".

Señales:

- Una alerta genera como máximo UNA señal (idempotencia por alerta).
- La señal lleva: alerta_id, ticker BYMA, estrategia, compra/venta, hora y
  precio USD (solo registro).
- Toda señal vence a los 60 s si EasyTrading no la tomó → "vencida"; no se
  ejecuta nunca después.
- El resultado que devuelve EasyTrading (ejecutada con precio y nominales,
  o descartada con su motivo) se guarda con la señal y se muestra junto a
  la alerta. La web no guarda posiciones ni calcula resultados.

Destildado automático de CORTO:

- Cuando EasyTrading avisa que se cerró TODA una posición de corto plazo
  (por venta, stop, TP o trailing), la web destilda "activo" en corto para
  ese activo. Intradía no se toca.

## 7. Responsabilidad de EasyTrading (resumen)

Se diseña en detalle en el repo de EasyTrading; acá solo lo que la web
necesita saber.

- Tiene su propia lista de activos (doble validación), que igual que en
  la web filtra SOLO COMPRAS: una compra de un activo que no está en su
  lista, o con la estrategia apagada, se descarta. Una venta con posición
  abierta se ejecuta aunque el activo no esté en su lista. La doble
  validación protege de entrar por alertas viejas; nunca impide salir.
- Arma la orden con su propia configuración, en ARS: nominales, tope de
  posición, stop, TP, trailing, modo PAPER/REAL (doble candado con
  EJECUCION_REAL) y la regla de qué vender en cada estrategia.
- Lleva las posiciones y vigila stop / TP / trailing localmente.
- Devuelve el resultado de cada señal tomada: ejecutada (precio y
  nominales) o descartada con motivo ("no está en la lista de
  EasyTrading", "estrategia apagada", "sin configurar", "sin posición
  abierta", etc.).
- Avisa a la web cuando se cierra toda una posición de CORTO (sección 8).
- Guarda el ID de señal: al reconectar, nunca re-ejecuta una señal ya
  tomada.
- El polling va por HTTPS a la web: NO consume getToken ni WebSocket de
  Primary (límites de 1/día intactos).

Decisiones abiertas (a resolver en EasyTrading):

- Stop en el broker: evaluar cargar una orden stop en Cocos/Primary
  (protege aunque la PC esté apagada), si el broker la acepta para CEDEARs.
- Stop vs spread: comprar al ask y medir el stop con el bid puede
  dispararlo enseguida en CEDEARs con spread ancho. Evaluar medir con el
  último operado, o exigir que la condición se mantenga X segundos.
- Reentrada en intradía: tras salir por stop el activo sigue tildado
  "operar hoy", y una nueva alerta de compra vuelve a entrar. (En corto
  no pasa: al cerrarse la posición la web lo destilda.)
- Venta de la tenencia real del broker (hoy: solo la posición abierta por
  la app).

## 8. Aviso de posición de corto cerrada

EasyTrading llama a la API de la web (no escribe directo en Supabase):

- POST /api/easytrading/posicion-cerrada, con el mismo token que el resto
  de la API. Cuerpo: ticker BYMA, estrategia ("corto"), hora del cierre y,
  si lo hubo, el ID de la señal que lo cerró.
- La web busca el activo por ticker BYMA (vía "tickers") en la lista de
  corto, lo destilda y registra el aviso. Si ya estaba destildado, no hace
  nada y responde OK (idempotente: EasyTrading puede reintentar).
- Si el ticker no está en la lista de corto, responde OK y registra el
  aviso con motivo "no está en la lista".

Por qué por API y no escribiendo en Supabase: EasyTrading usa una sola
credencial (el token), que se revoca desde la web; no hace falta darle a
la PC una clave con acceso a la base, y la regla de destildado queda en un
solo lugar.

## 9. Tablas (orientativo)

tickers (ticker_usa → ticker_byma), activos (ticker_usa, estrategia,
activo, operar_hoy_fecha, onda, sub_onda, notas), alertas (payload crudo,
hora, ticker, precio USD, acción, estado, motivo), intentos_rechazados
(hora, IP; sin payload), senales (alerta_id único, ticker BYMA,
estrategia, acción, estado, vence_en, resultado de EasyTrading: precio,
nominales, motivo), avisos_easytrading (cierres de posición de corto),
configuracion (horario, vencimiento, envío a EasyTrading activado),
feriados (fecha, descripción).
No hay tabla de posiciones.
Cripto: tablas propias en su fase.

## 10. Fases (validar cada una antes de seguir)

WEB:

- F1: proyecto, login, listas corto/intradía (tilde, onda, sub-onda,
  notas), mapeo de tickers, tilde rápido desde la tabla.
- F2: webhook + registro de alertas + vista por tipo + botón
  "simular alerta" para probar sin TradingView. No genera señales.
  Incluye un cron diario de Vercel que hace una consulta mínima a Supabase
  para evitar que el plan Free pause el proyecto por inactividad.
- F3: filtro de señales + vencimiento + API EasyTrading (señales, tomar,
  resultado, aviso de corto cerrado → destildar) + resultado junto a cada
  alerta.
  - Interruptor "Envío a EasyTrading: ACTIVADO / PAUSADO", visible en
    todas las pantallas; en pausa las alertas se siguen guardando,
    descartadas con motivo "pausado".

EASYTRADING (en su propio repo):

- F4: módulo puente (pull, tomar, reportar resultado) solo en PAPER.
- F5: posiciones + stop / TP / trailing locales + aviso de corto cerrado,
  en PAPER.
- F6: REAL con doble candado, 1 nominal primero, después montos chicos.

LUEGO:

- F7: cripto (ejecutor en la nube hacia BingX/Binance; ojo, Binance bloquea
  IPs de EE.UU.).
- F8: venta de tenencia real del broker (en EasyTrading).

## 11. Reglas de trabajo con Claude Code

- Rama de desarrollo, nunca main. git add con rutas explícitas.
  git log después de cada commit. Nada de push/deploy sin aprobación.
- Protocolo en dos fases: CC investiga y propone → Fran aprueba → CC implementa.
- CC no toca .env ni ejecuta la app; lo hace Fran.
- Tests verdes antes de cada commit.
