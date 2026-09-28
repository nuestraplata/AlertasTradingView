# Alertas TradingView

Web que recibe TODAS las alertas de TradingView (webhook), las registra y
pasa como **señales** a EasyTrading (PC local) las de los activos tildados.
EasyTrading decide con su propia configuración, ejecuta en Cocos Capital y
devuelve el resultado. La web no arma órdenes ni guarda posiciones.

- Especificación completa: [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md)
- Stack: Next.js 16 + Supabase (Postgres + Auth) + Vercel, región São Paulo.

**Estado:** Fase 1 (login, listas corto/intradía con tilde rápido, mapeo de
tickers). El webhook y la API de EasyTrading llegan en F2/F3.

---

## Levantar el proyecto en Windows (PowerShell)

### 1. Requisitos

| Qué | Versión | Cómo verificar |
|---|---|---|
| Node.js | **24.x** (lo exige `package.json`) | `node -v` |
| npm | viene con Node | `npm -v` |
| Git | cualquiera reciente | `git --version` |

Node 24: descargá el instalador de la versión 24.x de nodejs.org, o con
winget (instala la LTS vigente):

```powershell
winget install OpenJS.NodeJS.LTS
```

Cerrá y volvé a abrir PowerShell después de instalar, y confirmá con
`node -v` que empiece con `v24.`.

### 2. Clonar el repo y posicionarse en `desarrollo`

```powershell
git clone https://github.com/nuestraplata/AlertasTradingView.git
cd AlertasTradingView
git switch desarrollo
```

Configurá con qué nombre y email salen tus commits, **solo para este repo**
(no toca la configuración global de Git):

```powershell
git config --local user.name "Fran"
git config --local user.email "tu-email@ejemplo.com"
```

### 3. Instalar dependencias

```powershell
npm ci
```

`npm ci` instala exactamente lo que dice `package-lock.json` (no lo
modifica). Usá `npm install <paquete>` solo para agregar algo nuevo.

### 4. Supabase (una sola vez por proyecto)

En https://supabase.com, dentro del proyecto (región **South America (São Paulo)**):

1. **Authentication → Sign In / Providers**
   - Email: **activado**.
   - "Allow new users to sign up": **desactivado** (nadie más se registra).
2. **Authentication → Users → Add user**: creá tu usuario (email +
   contraseña) y marcá "Auto confirm user".
3. En la configuración de seguridad del proyecto (**Security**):
   - "Automatically expose new tables": **desactivado**.
   - "Automatic RLS": **activado**.
   (Por eso cada migración trae sus propios `GRANT` y políticas RLS.)
4. **Migraciones**: en **SQL Editor → New query**, pegá y corré **en este
   orden** el contenido completo de cada archivo de `supabase/migrations/`:
   1. `20260926190000_tickers_y_activos.sql`
   2. `20260927120000_activos_solo_tilde_y_notas.sql`
   3. `20260927180000_alertas.sql`

   Cada una tiene que decir *"Success. No rows returned"*. Son
   todo-o-nada: si una falla, no deja nada a medias. **No las corras dos
   veces** (la segunda vez fallan sin cambiar nada).

   Verificación final:

   ```sql
   select string_agg(column_name, ', ' order by ordinal_position) as columnas
   from information_schema.columns
   where table_schema = 'public' and table_name = 'activos';
   ```

   Tiene que devolver: `id, ticker_usa, estrategia, onda, sub_onda, notas,
   activo, operar_hoy_fecha, created_at, updated_at`.

   Y las tablas de alertas (F2), con estos permisos:

   ```sql
   select c.relname as tabla, c.relrowsecurity as rls,
          has_table_privilege('service_role', c.oid, 'INSERT') as servidor_inserta,
          has_table_privilege('authenticated', c.oid, 'INSERT') as panel_inserta
   from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('alertas', 'intentos_rechazados');
   ```

   2 filas con `rls = true`, `servidor_inserta = true`, `panel_inserta = false`.

### 5. Variables de entorno (`.env.local`)

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Completá estas dos líneas (Supabase → **Project Settings → API Keys**):

```
NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

- La publishable key (`sb_publishable_...`) es pública: se puede usar en
  el navegador. **Nunca** pongas ahí la secret key (`sb_secret_...`): si
  lo detecta, la app muestra un error y no se conecta.
- Sin comillas ni espacios. Si copiás y pegás, puede colarse un carácter
  invisible: la app lo detecta y dice cuál y en qué posición. En ese caso
  **escribí la URL a mano**.
- `.env.local` **nunca se commitea** (está en `.gitignore`).

#### Variables de F2 (webhook)

```
SUPABASE_SECRET_KEY=sb_secret_...
WEBHOOK_CLAVE=<64 caracteres aleatorios>
```

- `SUPABASE_SECRET_KEY`: Supabase → **Project Settings → API Keys** →
  secret key. Da acceso total a la base: **solo servidor**, nunca con
  prefijo `NEXT_PUBLIC_`, nunca en el navegador ni en un mensaje.
- `WEBHOOK_CLAVE`: la clave que va en el campo `"clave"` del mensaje de
  TradingView. Generala en PowerShell (sirve también para otros secretos):

  ```powershell
  $b = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString("x2") })
  ```

  Mínimo 24 caracteres: si es más corta, el webhook responde 500 y lo
  registra en la consola del servidor.
- `CRON_SECRET`: secreto del cron diario que evita que Supabase pause el
  proyecto. Generalo con el mismo comando (un valor **distinto** de
  `WEBHOOK_CLAVE`). Vercel lo manda solo en cada ejecución.

#### Cron diario (keepalive)

`vercel.json` programa `GET /api/cron/keepalive` una vez por día
(`0 12 * * *` = entre las 12:00 y las 12:59 UTC, 9 a 10 h de Argentina;
el plan Hobby no garantiza el minuto). Hace una consulta mínima a
Supabase para que el plan Free no pause el proyecto por inactividad.
Solo corre en el deploy de **producción**. Se ve en Vercel → Settings →
Cron Jobs → **View Logs**.

Probarlo a mano (local o producción):

```powershell
$secreto = ((Get-Content .env.local) -match '^CRON_SECRET=')[0].Split('=',2)[1]
Invoke-RestMethod -Uri http://localhost:3000/api/cron/keepalive -Headers @{ Authorization = "Bearer $secreto" }
```

### 6. Levantar la app

```powershell
npm run dev
```

Abrí http://localhost:3000 → te lleva a `/login` → entrás con el usuario
del paso 4.2.

> Si cambiás `.env.local`, cortá con **Ctrl+C** y volvé a correr
> `npm run dev`: las variables se leen solo al arrancar.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | App en modo desarrollo en http://localhost:3000 |
| `npm test` | Tests (Vitest) |
| `npm run lint` | Revisión de código (ESLint) |
| `npm run build` | Build de producción (también chequea tipos) |
| `npm start` | Sirve el build de producción (después de `npm run build`) |

Antes de cada commit: `npm test`, `npm run lint` y `npm run build` en verde.

---

## Deploy en Vercel

1. **Add New → Project** → importá el repo de GitHub (si no aparece:
   **Adjust GitHub App Permissions** y dale acceso al repo).
2. **Antes del primer deploy**, en **Environment Variables**, cargá las 5
   variables para **Production** y **Preview**:

   | Variable | Valor | Sensitive |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto de Supabase | No |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | No |
   | `SUPABASE_SECRET_KEY` | `sb_secret_…` | **Sí** |
   | `WEBHOOK_CLAVE` | secreto propio de producción (≥ 24) | **Sí** |
   | `CRON_SECRET` | secreto propio de producción (≥ 24) | **Sí** |

   - Las `NEXT_PUBLIC_*` se incorporan **al build**: si cambian, hace falta
     **Redeploy**. Las demás se leen en cada pedido, pero también requieren
     redeploy para tomar el valor nuevo.
   - `WEBHOOK_CLAVE` y `CRON_SECRET` de producción son **distintos** de los
     de `.env.local` y se guardan en un gestor de contraseñas.
3. La región (`gru1`, São Paulo) la fija `vercel.json` y la versión de Node
   (24.x) la fija `package.json`: no hay que tocarlas. Se verifica en el
   deploy → **Functions**: región `gru1`.
4. `main` se publica en producción; cada push a `desarrollo` genera una
   URL de "preview" (protegida con login de Vercel).
5. **Webhook**: en producción solo acepta pedidos desde las IPs de
   TradingView (`lib/alertas/ip.ts`). Un pedido desde tu PC con la clave
   correcta responde **403** y queda como "IP no permitida": es lo esperado.
   En los previews el webhook no se puede probar desde afuera (login de
   Vercel).
6. **Cron**: Vercel → **Settings → Cron Jobs** muestra
   `/api/cron/keepalive` (`0 12 * * *`). Solo corre en producción; los
   resultados, en **View Logs**.

### Probar producción desde PowerShell

Piden la URL y el secreto sin mostrarlos ni guardarlos en el historial:

```powershell
$url = (Read-Host "URL de producción (https://...vercel.app)").TrimEnd("/")
$sec = Read-Host "CRON_SECRET de producción" -AsSecureString
$cron = [System.Net.NetworkCredential]::new("", $sec).Password
Invoke-RestMethod -Uri "$url/api/cron/keepalive" -Headers @{ Authorization = "Bearer $cron" }
Remove-Variable cron, sec
```

Tiene que responder `ok : True`.

---

## Estructura

```
app/
  login/                 Pantalla de login (Server Action)
  (panel)/               Todo lo que exige sesión (layout con pestañas)
    [estrategia]/        /corto y /intradia: lista, alta (nuevo/), edición ([id]/)
    tickers/             Mapeo ticker USA → CEDEAR
components/              Componentes compartidos (avisos, navegación, activos)
lib/
  activos/               Validación (zod), tilde / "operar hoy", filas
  auth/                  Rutas públicas, sesión, credenciales
  db/                    Traducción de errores de la base
  supabase/              Clientes de Supabase y validación de variables
  tickers/               "Usado en" de cada ticker
  fechas.ts              Fecha de hoy en Argentina
proxy.ts                 (Next 16: ex "middleware") exige login y refresca la sesión
supabase/migrations/     SQL que se corre a mano en Supabase, en orden
docs/ESPECIFICACION.md   Qué hace la app y por qué
```

---

## Forma de trabajo

- Se trabaja siempre en `desarrollo`; `main` solo recibe lo aprobado.
- `git add` con rutas explícitas, nunca `git add .`.
- Las migraciones las corre Fran en el SQL Editor; cada una incluye
  `GRANT` explícitos y políticas RLS.
- Detalle en [docs/ESPECIFICACION.md §11](docs/ESPECIFICACION.md).

---

## Problemas comunes

**"npm : No se puede cargar el archivo ...\npm.ps1 porque la ejecución de
scripts está deshabilitada"**
PowerShell bloquea scripts. Habilitalos solo para tu usuario:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**La app dice "Falta NEXT_PUBLIC_SUPABASE_URL" o "carácter inválido (U+XXXX)"**
Revisá `.env.local` (paso 5), escribí el valor a mano y reiniciá
`npm run dev`.

**"fetch failed" / no conecta con Supabase**
1. Reiniciá `npm run dev`.
2. Revisá que la URL sea exactamente la de Supabase (reescribila a mano).
3. En Supabase, verificá que el proyecto no esté **pausado** (el plan Free
   lo pausa tras 7 días sin uso: botón "Restore project").

**El puerto 3000 está ocupado**

```powershell
npm run dev -- -p 3001
```

**Avisos "LF will be replaced by CRLF" al commitear**
Son normales en Windows: en el repo los archivos quedan con LF.
