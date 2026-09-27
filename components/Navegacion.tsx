"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANIAS = [
  { href: "/corto", texto: "Corto plazo" },
  { href: "/intradia", texto: "Intradía" },
  { href: "/tickers", texto: "Tickers" },
] as const;

export function Navegacion() {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones" className="flex gap-1 overflow-x-auto">
      {PESTANIAS.map((p) => {
        const actual = pathname === p.href || pathname.startsWith(`${p.href}/`);
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={actual ? "page" : undefined}
            className={`whitespace-nowrap rounded px-3 py-1.5 text-sm ${
              actual ? "bg-foreground font-medium text-background" : "hover:bg-current/10"
            }`}
          >
            {p.texto}
          </Link>
        );
      })}
    </nav>
  );
}
