# Alertas TradingView

Web que recibe alertas de TradingView por webhook, las clasifica y genera
órdenes que EasyTrading (PC local) consulta y ejecuta en Cocos Capital.

Stack: Next.js + Supabase + Vercel (región São Paulo).

La especificación completa está en [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md).

## Ramas

- `desarrollo`: donde se trabaja siempre.
- `main`: solo recibe lo aprobado.

## Secretos

Los secretos van en `.env.local` (nunca se commitea). La plantilla es
`.env.example`.
