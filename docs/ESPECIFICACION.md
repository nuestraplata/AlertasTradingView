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
- Secretos en variables de entorno, nunca en el código.

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

- Clave inválida → rechazar, no genera nada.
- Todas las alertas válidas se guardan, incluso las descartadas, con motivo.

## 5. Configuración de activos (acciones)

Dos listas separadas: CORTO PLAZO e INTRADÍA.
Un mismo ticker PUEDE estar en ambas; son posiciones independientes.
Clave única: (ticker_usa, estrategia).

Campos por activo:

- ticker_usa (el de TradingView) y ticker_byma (CEDEAR). Mapeo manual
  porque pueden no coincidir.
- Siempre se opera el CEDEAR en ARS, plazo 24hs (el ticker sin sufijo,
  compatible con Instrumento.ticker de EasyTrading).
- nominales (fijos, editables en cualquier momento)
- entrada_usd, tp_usd, sl_usd (cargados sobre el gráfico USA)
- onda, sub_onda, notas (solo anotación, no afectan ninguna regla)
- modo: PAPER | REAL (por defecto PAPER)
- Corto plazo: tilde "activo".
- Intradía: tilde "operar hoy", que se destilda solo al empezar cada día.

## 6. Reglas de negocio

Generales:

- Alertas fuera del horario de mercado (configurable) → se descartan.
- Ticker no configurado para esa estrategia → se descarta.
- Una alerta genera como máximo UNA orden (idempotencia por alerta).
- Toda orden vence a los 60 s si EasyTrading no la tomó → "vencida",
  no se ejecuta nunca después.
- Nunca vender más nominales de los que hay abiertos en esa estrategia.
  Si la posición ya está cerrada (por ejemplo, el SL local ganó de mano a la
  alerta), la venta se descarta.
- Compra con posición abierta → se suma (se promedia).

Corto plazo:

- Compra: solo si el activo está tildado "activo".
- Venta / TP / SL: vende TODA la posición de corto plazo de ese activo.
  - Etapa inicial: la posición abierta por la app.
  - Futuro (cuando EasyTrading tenga F4, tenencia real del broker):
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

activos, alertas (payload crudo + tipo + estado + motivo), ordenes
(alerta_id único, estado, vence_en, resultado), posiciones (por activo y
estrategia: nominales, ppc_ars, ppc_usd, sl_ars, fecha apertura),
configuracion (horario, vencimiento).
Cripto: tablas propias en su fase.

## 10. Fases (validar cada una antes de seguir)

WEB:

- F1: proyecto, login, listas corto/intradía (CRUD), mapeo de tickers.
- F2: webhook + registro de alertas + vista por tipo + botón
  "simular alerta" para probar sin TradingView. No genera órdenes.
- F3: motor de reglas + órdenes pendientes + vencimiento + API EasyTrading.

EASYTRADING (en su propio repo):

- F4: módulo puente (pull, tomar, reportar) solo en PAPER.
- F5: posiciones + SL local, en PAPER.
- F6: REAL con doble candado, 1 nominal primero, después montos chicos.

LUEGO:

- F7: cripto (ejecutor en la nube hacia BingX/Binance; ojo, Binance bloquea
  IPs de EE.UU.).
- F8: venta de tenencia real del broker (depende de F4 de EasyTrading).

## 11. Reglas de trabajo con Claude Code

- Rama de desarrollo, nunca main. git add con rutas explícitas.
  git log después de cada commit. Nada de push/deploy sin aprobación.
- Protocolo en dos fases: CC investiga y propone → Fran aprueba → CC implementa.
- CC no toca .env ni ejecuta la app; lo hace Fran.
- Tests verdes antes de cada commit.
