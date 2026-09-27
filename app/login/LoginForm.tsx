"use client";

import { useActionState } from "react";
import { iniciarSesion } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [estado, accion, enviando] = useActionState(iniciarSesion, undefined);

  return (
    <form action={accion} className="flex w-full max-w-xs flex-col gap-3">
      {next && <input type="hidden" name="next" value={next} />}

      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="rounded border border-current/30 bg-transparent px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Contraseña
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded border border-current/30 bg-transparent px-2 py-1"
        />
      </label>

      {estado?.error && (
        <p role="alert" className="text-sm text-red-600">
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="rounded bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-50"
      >
        {enviando ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
