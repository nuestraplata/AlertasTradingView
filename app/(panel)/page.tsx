import { connection } from "next/server";
import { verificarSupabase } from "@/lib/supabase/estado";

export default async function Home() {
  await connection(); // se evalúa en cada request, no en el build
  const estado = await verificarSupabase();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Alertas TradingView</h1>
      <p className="text-sm opacity-70">Fase 1 en construcción.</p>

      <section className="rounded border border-current/20 p-4 text-sm">
        <h2 className="mb-2 font-medium">Conexión con Supabase</h2>
        {estado.ok ? (
          <ul className="space-y-1">
            <li>✅ Conectado</li>
            <li>
              {estado.emailActivo ? "✅" : "⚠️"} Login por email{" "}
              {estado.emailActivo ? "activo" : "desactivado"}
            </li>
            <li>
              {estado.registroPublicoDesactivado ? "✅" : "⚠️"} Registro
              público{" "}
              {estado.registroPublicoDesactivado ? "desactivado" : "ACTIVADO"}
            </li>
          </ul>
        ) : (
          <div>
            <p>❌ Sin conexión:</p>
            <pre className="mt-2 max-w-2xl whitespace-pre-wrap break-all font-mono text-xs">
              {estado.error}
            </pre>
          </div>
        )}
      </section>
    </main>
  );
}
