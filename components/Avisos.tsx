"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type Tipo = "ok" | "error";
type Aviso = { id: number; texto: string; tipo: Tipo };

const AvisosContext = createContext<(texto: string, tipo?: Tipo) => void>(() => {});

/** Muestra un aviso flotante que desaparece solo ("AAPL guardado", etc.). */
export function useAviso() {
  return useContext(AvisosContext);
}

export function AvisosProvider({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguienteId = useRef(0);

  const cerrar = useCallback((id: number) => {
    setAvisos((a) => a.filter((x) => x.id !== id));
  }, []);

  const avisar = useCallback(
    (texto: string, tipo: Tipo = "ok") => {
      const id = ++siguienteId.current;
      setAvisos((a) => [...a, { id, texto, tipo }]);
      setTimeout(() => cerrar(id), tipo === "error" ? 10_000 : 6_000);
    },
    [cerrar],
  );

  return (
    <AvisosContext.Provider value={avisar}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end"
      >
        {avisos.map((a) => (
          <div
            key={a.id}
            role={a.tipo === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex max-w-sm items-start gap-3 rounded px-4 py-2 text-sm text-white shadow-lg ${
              a.tipo === "error" ? "bg-red-700" : "bg-emerald-700"
            }`}
          >
            <span className="flex-1">{a.texto}</span>
            <button
              type="button"
              onClick={() => cerrar(a.id)}
              aria-label="Cerrar aviso"
              className="opacity-80 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </AvisosContext.Provider>
  );
}
