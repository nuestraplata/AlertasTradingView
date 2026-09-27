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

1. **Add New → Project** → importá el repo de GitHub.
2. **Settings → Environment Variables**: cargá `NEXT_PUBLIC_SUPABASE_URL` y
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Production y Preview).
3. La región (`gru1`, São Paulo) la fija `vercel.json` y la versión de Node
   (24.x) la fija `package.json`: no hay que tocarlas.
4. `main` se publica en producción; cada push a `desarrollo` genera una
   URL de "preview".

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
