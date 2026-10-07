# EasyTrading ↔ Alertas TradingView (contrato)

Contrato entre la web (Alertas TradingView) y el módulo puente de
EasyTrading. El módulo puente se implementa en el repo de EasyTrading
(F4); este documento es lo que tiene que respetar.

**Modelo pull, sin HTTP:** EasyTrading se conecta **directo a Postgres**
de Supabase (pooler, IPv4) con un usuario propio, `easytrading_bot`, y
llama a 4 funciones. La PC nunca se expone a internet. No pasa por Vercel:
consultar cada pocos segundos por HTTP podía agotar la CPU del plan Hobby
y tirar también el webhook de TradingView.

**La web no arma órdenes.** Entrega señales ("comprar/vender este CEDEAR
en esta estrategia") y guarda lo que EasyTrading informa. Nominales,
tope, stop 2 %, trailing, TP, modo PAPER/REAL y la regla de qué vender
viven en EasyTrading, todo en ARS.

---

## Conexión

| Dato | Valor |
|---|---|
| Host | El del **Session pooler** de Supabase: Dashboard → **Connect** → *Session pooler*. Tiene la forma `aws-0-sa-east-1.pooler.supabase.com` (puede ser `aws-1-…`): copialo de ahí. |
| Puerto | `5432` (session pooler) |
| Base | `postgres` |
| Usuario | `easytrading_bot.<project_ref>` (ej.: `easytrading_bot.abcdefghijklmnop`). El `project_ref` es el código de la URL del proyecto: `https://<project_ref>.supabase.co`. |
| Contraseña | La que cargó Fran con `alter role` (README, paso 4). Guardarla en un gestor de contraseñas y en una variable de entorno de la PC, nunca en el código. |
| SSL | `sslmode=require` como mínimo. Mejor `sslmode=verify-full` con el certificado de Supabase (Dashboard → Database → SSL Configuration → *Download certificate*) en `sslrootcert`. |

```
postgresql://easytrading_bot.<project_ref>:<contraseña>@<host-del-pooler>:5432/postgres?sslmode=require
```

- **Por qué el pooler:** la conexión directa (`db.<project_ref>.supabase.co`)
  es solo IPv6; el pooler acepta IPv4.
- **Session y no transaction pooler (6543):** el modo transacción no
  admite sentencias preparadas, que psycopg usa solo. Si igual se usa el
  6543, conectar con `prepare_threshold=None`.
- **Autocommit:** cada llamada es su propia transacción. No abrir
  transacciones largas (el rol corta a los 30 s una transacción ociosa).
- **Límites del rol:** como mucho **3 conexiones** a la vez y **5 s** por
  consulta. Usar **una** conexión y reconectar si se corta.
- **Qué puede hacer el usuario:** solo ejecutar las 4 funciones de abajo.
  No puede leer ni escribir ninguna tabla, ni crear nada, ni llamar a
  otras funciones de la app. La hora la pone el servidor.

Todas las funciones devuelven **jsonb** (psycopg lo entrega como `dict`).
Los errores de datos no son excepciones: vuelven como
`{"resultado": "datos_invalidos", "detalle": "…"}`.

---

## Ciclo de vida de una señal

```
pendiente ──tomar──▶ tomada ──resultado──▶ ejecutada | descartada
    │
    └── 60 s sin tomar ──▶ vencida  (NO se ejecuta nunca)
```

- Una alerta genera como máximo **una** señal.
- Una señal se puede tomar **una sola vez** (atómico en la base).
- **Pausa** ("Pausar todo" en el panel): `pendientes` devuelve la lista
  vacía y `tomar` responde `pausado`. Las pendientes vencen solas a los 60 s.
- Una señal **tomada sin resultado** aparece en el panel ("sin resultado
  hace X"), en rojo después de 2 min.

---

## 1. `public.easytrading_pendientes()` → señales pendientes

```sql
select public.easytrading_pendientes();
```

Sin parámetros. Llamarla cada **2 a 3 s**, solo en horario de mercado
(10:30–17:00 de Argentina, o el configurado en el panel). Además vence las
señales de más de 60 s y le muestra al panel que EasyTrading está
conectado.

```json
{
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
| `envio_activado` | `false` = pausa: la lista viene vacía. |
| `id` | ID de la señal. **Guardarlo** localmente: nunca re-ejecutar una señal ya tomada. |
| `origen` | `tradingview` o `simulada` (botón "Simular alerta" del panel con "enviar" tildado). **En modo REAL, descartar las `simulada`** con motivo `"simulada"`. |
| `ticker_byma` | CEDEAR sin sufijo (compatible con `Instrumento.ticker`). |
| `estrategia` | `corto` o `intradia`. |
| `accion` | `compra` o `venta`. |
| `precio_usd` | `{{close}}` de TradingView. **Solo registro**: no usarlo para la orden. |
| `vence_en` | Después de esta hora la señal ya no se puede tomar. |

Ordenadas por `id` (la más vieja primero).

---

## 2. `public.easytrading_tomar(p_id bigint)` → tomar una señal

```sql
select public.easytrading_tomar(17);
```

**Solo si devuelve `"resultado": "tomada"` se puede ejecutar la señal.**

| `resultado` | Ejemplo | Qué hacer |
|---|---|---|
| `tomada` | `{"resultado": "tomada", "senal": {…, "estado": "tomada"}}` | Es tuya: decidir con tu configuración y operar. |
| `no_disponible` | `{"resultado": "no_disponible", "estado": "tomada"}` | Ya la tomaste (o la tomó otra instancia). **No ejecutar.** |
| `no_disponible` | `{"resultado": "no_disponible", "estado": "vencida"}` | Pasaron 60 s. **No ejecutar.** |
| `pausado` | `{"resultado": "pausado", "estado": "pendiente"}` | Envío en pausa. **No ejecutar.** |
| `no_existe` | `{"resultado": "no_existe"}` | ID desconocido. No ejecutar. |
| `datos_invalidos` | `{"resultado": "datos_invalidos", "detalle": "…"}` | `p_id` nulo o ≤ 0. Bug del cliente. |

---

## 3. `public.easytrading_resultado(...)` → informar el resultado

```sql
select public.easytrading_resultado(
  p_id         bigint,   -- la señal tomada
  p_estado     text,     -- 'ejecutada' | 'descartada'
  p_precio_ars numeric,  -- ejecutada: precio promedio en pesos (> 0); descartada: null
  p_nominales  integer,  -- ejecutada: > 0; descartada: null
  p_modo       text,     -- ejecutada: 'PAPER' | 'REAL'; descartada: null
  p_motivo     text      -- descartada: 1 a 500 caracteres; ejecutada: null
);
```

Ejemplos:

```sql
select public.easytrading_resultado(17, 'ejecutada', 15230.5, 10, 'PAPER', null);
select public.easytrading_resultado(18, 'descartada', null, null, null, 'sin posición abierta');
```

Motivos sugeridos para `descartada`: `"no está en la lista de
EasyTrading"`, `"estrategia apagada"`, `"sin configurar"`, `"sin
posición abierta"`, `"simulada"`, `"rechazada por el broker: …"`.

| `resultado` | Significado |
|---|---|
| `registrado` | Guardado. `{"resultado": "registrado", "estado": "ejecutada"}` |
| `ya_registrado` | Ya estaba guardado **exactamente igual** (reintento seguro). |
| `no_disponible` | La señal no está tomada (pendiente, vencida) o ya tiene **otro** resultado. Trae `estado`. |
| `no_existe` | ID desconocido. |
| `datos_invalidos` | Algún parámetro no cumple las reglas de arriba; `detalle` dice cuál. No se guardó nada. |

La web solo guarda y muestra el resultado junto a la alerta. No calcula
posiciones ni resultados.

---

## 4. `public.easytrading_posicion_cerrada(...)` → se cerró TODA una posición de corto

```sql
select public.easytrading_posicion_cerrada(
  p_ticker_byma text,         -- CEDEAR sin sufijo (se pasa a mayúsculas)
  p_estrategia  text,         -- solo 'corto'
  p_cerrada_en  timestamptz,  -- cuándo se cerró, CON zona horaria
  p_senal_id    bigint        -- opcional: la señal que la cerró (null si fue stop / TP / trailing)
);
```

Cuando se cierra **toda** una posición de **corto plazo** (venta, stop,
TP o trailing). La web destilda "activo" de ese activo en la lista de
corto (para no volver a entrar con una alerta vieja). Intradía no se
avisa.

```sql
select public.easytrading_posicion_cerrada('AAPL', 'corto', '2026-10-01 16:30:00-03', 17);
```

```json
{ "resultado": "destildado", "repetido": false }
```

| `resultado` | Significado |
|---|---|
| `destildado` | Estaba tildado y se destildó. |
| `ya_destildado` | Ya estaba destildado. |
| `no_esta_en_la_lista` | El CEDEAR existe en Tickers pero no está en la lista de corto. |
| `ticker_desconocido` | El CEDEAR no está en Tickers. |
| `datos_invalidos` | Ticker mal formado, estrategia que no es `corto`, sin `p_cerrada_en` o con fecha más de 5 min en el futuro. No se toca nada. |

`repetido: true` = ese mismo aviso (ticker + `p_cerrada_en`) ya había
llegado; no se vuelve a destildar (por si Fran lo tildó de nuevo).
**Mandar siempre la misma `p_cerrada_en` para el mismo cierre**: es lo que
hace seguro reintentar.

---

## Reintentos

Si la conexión se corta o una llamada falla con excepción (red, timeout,
Supabase caído): reconectar con espera creciente (1 s, 2 s, 4 s… hasta
30 s) y reintentar según esta tabla.

| Función | ¿Reintentar es seguro? | Detalle |
|---|---|---|
| `easytrading_pendientes` | Sí | Solo lee (y anota la hora). |
| `easytrading_tomar` | Sí, pero… | Si la primera llamada se cortó sin respuesta, el reintento puede devolver `no_disponible / tomada` sin que sepas si la tomaste vos. En ese caso **no ejecutar** y reportarla `descartada` con motivo `"respuesta de tomar perdida"` (queda a la vista en el panel). |
| `easytrading_resultado` | Sí | El mismo resultado repetido devuelve `ya_registrado`. Reintentar hasta obtener `registrado`, `ya_registrado` o `no_disponible`. Guardar en la PC los resultados pendientes de informar, para no perderlos si EasyTrading se reinicia. |
| `easytrading_posicion_cerrada` | Sí | Con la misma `p_cerrada_en` devuelve `repetido: true`. |

Un `datos_invalidos` no se reintenta: es un error del cliente.

---

## Ejemplo mínimo en Python (psycopg 3)

```python
"""Módulo puente mínimo (F4). Requiere: pip install "psycopg[binary]"

EASYTRADING_DB_URL (variable de entorno de la PC):
postgresql://easytrading_bot.<project_ref>:<contraseña>@<host-del-pooler>:5432/postgres?sslmode=require
"""
import os
import time
from decimal import Decimal

import psycopg

DSN = os.environ["EASYTRADING_DB_URL"]


def conectar() -> psycopg.Connection:
    return psycopg.connect(DSN, autocommit=True, connect_timeout=10, application_name="easytrading")


def llamar(conn: psycopg.Connection, sql: str, params: tuple = ()) -> dict:
    """Ejecuta una función de entrada y devuelve su jsonb como dict."""
    return conn.execute(sql, params).fetchone()[0]


def ciclo(conn: psycopg.Connection, ya_tomadas: set[int]) -> None:
    r = llamar(conn, "select public.easytrading_pendientes()")
    for s in r["senales"]:  # la más vieja primero
        if s["id"] in ya_tomadas:
            continue
        t = llamar(conn, "select public.easytrading_tomar(%s::bigint)", (s["id"],))
        if t["resultado"] != "tomada":
            continue  # tomada por otro, vencida o en pausa: NO ejecutar
        ya_tomadas.add(s["id"])  # en la versión real: guardarlo en disco ANTES de operar

        # Acá EasyTrading decide con SU configuración y opera (PAPER en F4).
        nominales, precio = 10, Decimal("15230.50")

        llamar(
            conn,
            "select public.easytrading_resultado(%s::bigint, %s::text, %s::numeric, %s::integer, %s::text, %s::text)",
            (s["id"], "ejecutada", precio, nominales, "PAPER", None),
        )
        # Para descartar: (s["id"], "descartada", None, None, None, "sin posición abierta")


def main() -> None:
    ya_tomadas: set[int] = set()
    espera = 1
    conn = None
    while True:
        try:
            if conn is None or conn.closed:
                conn = conectar()
            ciclo(conn, ya_tomadas)
            espera = 1
            time.sleep(3)
        except psycopg.OperationalError as e:
            print("Sin conexión con Supabase:", e)
            if conn is not None:
                conn.close()
            conn = None
            time.sleep(espera)
            espera = min(espera * 2, 30)


if __name__ == "__main__":
    main()
```

- Los `::bigint`, `::numeric`, etc. evitan ambigüedades de tipos al pasar
  parámetros desde Python.
- `p_precio_ars` con `Decimal` (no `float`) para no perder centavos.
- `p_cerrada_en` con un `datetime` **con zona horaria** (`datetime.now(timezone.utc)`):
  ```python
  llamar(conn, "select public.easytrading_posicion_cerrada(%s::text, 'corto', %s::timestamptz, %s::bigint)",
         ("AAPL", cerrada_en, senal_id))
  ```

## Probar la conexión a mano (psql)

```powershell
psql "postgresql://easytrading_bot.<project_ref>@<host-del-pooler>:5432/postgres?sslmode=require" -c "select public.easytrading_pendientes();"
```

(psql pide la contraseña.) Tiene que devolver `{"senales": [], "envio_activado": false}`
o similar. Un `select * from public.alertas;` tiene que fallar con
*permission denied*.

## Consumo

Una consulta cada 3 s durante 6 h de mercado son ~7.200 llamadas por día:
no pasa por Vercel, y para Postgres son consultas mínimas. Igual, no
consultar fuera del horario de mercado ni más seguido que cada 1 s.
