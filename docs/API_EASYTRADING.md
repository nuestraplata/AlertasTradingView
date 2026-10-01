# API para EasyTrading (contrato)

Contrato entre la web (Alertas TradingView) y el módulo puente de
EasyTrading. El módulo puente se implementa en el repo de EasyTrading
(F4); este documento es lo que tiene que respetar.

**Modelo pull:** EasyTrading consulta a la web. La PC nunca se expone a
internet y no tiene credenciales de la base: solo este token.

**La web no arma órdenes.** Entrega señales ("comprar/vender este CEDEAR
en esta estrategia") y guarda lo que EasyTrading informa. Nominales,
tope, stop 2 %, trailing, TP, modo PAPER/REAL y la regla de qué vender
viven en EasyTrading, todo en ARS.

---

## Autenticación

Todas las llamadas llevan:

```
Authorization: Bearer <EASYTRADING_TOKEN>
```

- `Bearer` con B mayúscula y **un** espacio; el token exacto (sin
  espacios ni saltos de línea).
- Token incorrecto o ausente → `401 {"ok": false}` (sin detalles).
- `500 {"ok": false}` → el servidor no tiene el token configurado.
- Revocar: cambiar `EASYTRADING_TOKEN` en Vercel y hacer **Redeploy**.
  Para cortar todo al instante, usar **"Pausar todo"** en el panel.

Base: `https://<dominio-de-producción>/api/easytrading`. Todas las
respuestas son JSON con `Cache-Control: no-store`.

---

## Ciclo de vida de una señal

```
pendiente ──tomar──▶ tomada ──resultado──▶ ejecutada | descartada
    │
    └── 60 s sin tomar ──▶ vencida  (NO se ejecuta nunca)
```

- Una alerta genera como máximo **una** señal (`alerta_id` único).
- Una señal se puede tomar **una sola vez** (atómico en la base).
- El envío en **pausa** ("Pausar todo"): la lista viene vacía y `tomar`
  responde 409 `pausado`. Las pendientes vencen solas a los 60 s.

---

## 1. GET `/senales` — señales pendientes

Consultar cada **2 a 3 s**, solo en horario de mercado (11:00–17:00 de
Argentina, o el horario configurado en el panel). Cada consulta también
vence las señales viejas y le muestra al panel que EasyTrading está
conectado.

**200**

```json
{
  "ok": true,
  "envio_activado": true,
  "senales": [
    {
      "id": 17,
      "alerta_id": 352,
      "origen": "tradingview",
      "ticker_byma": "AAPL",
      "ticker_usa": "AAPL",
      "estrategia": "corto",
      "accion": "compra",
      "precio_usd": 185.5,
      "creada_en": "2026-10-01T17:00:00.123+00:00",
      "vence_en": "2026-10-01T17:01:00.123+00:00",
      "estado": "pendiente"
    }
  ]
}
```

| Campo | Qué es |
|---|---|
| `id` | ID de la señal. **Guardarlo**: nunca re-ejecutar una señal ya tomada (§7 de la especificación). |
| `origen` | `tradingview` o `simulada` (botón "Simular alerta" del panel con "enviar" tildado). **En modo REAL, descartar las `simulada`** con motivo `"simulada"`. |
| `ticker_byma` | CEDEAR sin sufijo (compatible con `Instrumento.ticker`). |
| `estrategia` | `corto` o `intradia`. |
| `accion` | `compra` o `venta`. |
| `precio_usd` | `{{close}}` de TradingView. **Solo registro**: no usarlo para la orden. |
| `vence_en` | Después de esta hora la señal ya no se puede tomar. |

Ordenadas por `id` (la más vieja primero).

---

## 2. POST `/senales/{id}/tomar` — tomar una señal

Sin cuerpo. **Solo si responde 200 se puede ejecutar la señal.**

| Respuesta | Significado | Qué hacer |
|---|---|---|
| `200 {"ok": true, "senal": {…, "estado": "tomada"}}` | Es tuya. | Decidir con tu configuración y operar. |
| `409 {"ok": false, "error": "no_disponible", "estado": "tomada"}` | Ya la tomaste (o la tomó otra instancia). | **No ejecutar.** Si fue un reintento tuyo, revisar el ID guardado. |
| `409 {"ok": false, "error": "no_disponible", "estado": "vencida"}` | Pasaron 60 s. | **No ejecutar.** |
| `409 {"ok": false, "error": "pausado", "estado": "pendiente"}` | Envío en pausa. | **No ejecutar.** |
| `404 {"ok": false, "error": "no_existe"}` | ID desconocido. | No ejecutar. |
| `400 {"ok": false, "error": "id_invalido"}` | El ID no es un entero positivo. | Bug del cliente. |

Si la respuesta no llega (timeout de red), reintentar `tomar`: si ya la
habías tomado vas a recibir `409 no_disponible / tomada`. En ese caso,
como no se puede saber si el primer intento fue tuyo, lo seguro es **no
ejecutar** y reportarla como descartada con motivo `"respuesta de tomar
perdida"`.

---

## 3. POST `/senales/{id}/resultado` — informar el resultado

Solo para señales **tomadas**. Cuerpo JSON (máx. 10 KB), una de dos formas:

```json
{ "estado": "ejecutada", "precio_ars": 15230.5, "nominales": 10, "modo": "PAPER" }
```

```json
{ "estado": "descartada", "motivo": "sin posición abierta" }
```

| Campo | Regla |
|---|---|
| `precio_ars` | número > 0 (precio promedio de la orden, en pesos). |
| `nominales` | entero > 0. |
| `modo` | `"PAPER"` o `"REAL"`. |
| `motivo` | texto de 1 a 500 caracteres. Ej.: `"no está en la lista de EasyTrading"`, `"estrategia apagada"`, `"sin configurar"`, `"sin posición abierta"`, `"simulada"`, `"rechazada por el broker: …"`. |

| Respuesta | Significado |
|---|---|
| `200 {"ok": true, "estado": "ejecutada", "repetido": false}` | Guardado. |
| `200 {"ok": true, …, "repetido": true}` | Ya estaba guardado **exactamente igual** (reintento seguro). |
| `409 {"ok": false, "error": "no_disponible", "estado": "…"}` | La señal no está tomada (pendiente, vencida) o ya tiene **otro** resultado. |
| `404` | ID desconocido. |
| `400 {"ok": false, "error": "datos_invalidos", "detalle": {"campo": "mensaje"}}` | Cuerpo inválido. |
| `400 {"ok": false, "error": "json_invalido"}` / `413` | No es JSON / más de 10 KB. |

La web solo guarda y muestra el resultado junto a la alerta. No calcula
posiciones ni resultados.

---

## 4. POST `/posicion-cerrada` — se cerró TODA una posición de corto

Cuando se cierra **toda** una posición de **corto plazo** (venta, stop,
TP o trailing). La web destilda "activo" de ese activo en la lista de
corto (para no volver a entrar con una alerta vieja). Intradía no se
avisa.

```json
{
  "ticker_byma": "AAPL",
  "estrategia": "corto",
  "cerrada_en": "2026-10-01T16:30:00-03:00",
  "senal_id": 17
}
```

| Campo | Regla |
|---|---|
| `ticker_byma` | CEDEAR sin sufijo (se pasa a mayúsculas). |
| `estrategia` | solo `"corto"`. |
| `cerrada_en` | fecha y hora ISO 8601 **con zona horaria** (`Z` o `-03:00`). Junto con el ticker identifica el aviso: reenviar el mismo aviso no hace nada. |
| `senal_id` | opcional: la señal que cerró la posición (`null` si fue stop / TP / trailing local). |

**200** siempre que el pedido sea válido:

```json
{ "ok": true, "resultado": "destildado", "repetido": false }
```

| `resultado` | Significado |
|---|---|
| `destildado` | Estaba tildado y se destildó. |
| `ya_destildado` | Ya estaba destildado. |
| `no_esta_en_la_lista` | El CEDEAR existe en Tickers pero no está en la lista de corto. |
| `ticker_desconocido` | El CEDEAR no está en Tickers. |

`repetido: true` = ese mismo aviso (ticker + `cerrada_en`) ya había
llegado; no se vuelve a destildar (por si Fran lo tildó de nuevo).

---

## Errores comunes a todos

| HTTP | Qué hacer |
|---|---|
| 401 | Token mal configurado en EasyTrading. No reintentar en loop. |
| 500 / 502 / timeout | Reintentar con espera (1 s, 2 s, 4 s…). `tomar`, `resultado` y `posicion-cerrada` son seguros de reintentar. |

---

## Ejemplo de ciclo (pseudocódigo)

```
cada 2 s, en horario:
  r = GET /senales
  para cada s en r.senales (la más vieja primero):
    si s.id ya está en mi registro local: continuar
    t = POST /senales/{s.id}/tomar
    si t.status != 200: continuar          # NO ejecutar
    guardar s.id en el registro local       # antes de operar
    resultado = decidir_y_operar(t.senal)   # con la config de EasyTrading
    POST /senales/{s.id}/resultado (reintentar hasta 200 / 409)
    si cerró toda una posición de corto:
      POST /posicion-cerrada
```

## Límites del plan gratuito

Consultar cada 2 s durante 6 h de mercado son ~10.800 pedidos por día
(~240.000 por mes). Debería entrar en el plan Hobby de Vercel, pero hay
que mirar **Vercel → Usage** la primera semana de F4. No consultar fuera
del horario de mercado ni más seguido que cada 1 s.
