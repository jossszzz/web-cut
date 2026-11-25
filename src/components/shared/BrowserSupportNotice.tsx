"use client";

import { AlertTriangle, XCircle } from "lucide-react";
import { useMemo } from "react";

import { canExport, detectBrowserSupport, missingEssentials } from "@/lib/browserSupport";
import { useHydrated } from "@/lib/hooks/useHydrated";

/** Aviso si el navegador no tiene lo necesario para editar o para exportar. */
export function BrowserSupportNotice() {
  const hydrated = useHydrated();
  const support = useMemo(() => (hydrated ? detectBrowserSupport() : null), [hydrated]);
  if (!support) return null;

  const missing = missingEssentials(support);
  if (missing.length > 0) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
        <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        Este navegador no admite {missing.join(", ")}, necesarios para el editor. Usa una versión reciente de Chrome,
        Edge, Safari o Firefox, fuera del modo de compatibilidad.
      </p>
    );
  }
  if (!canExport(support)) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-300">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        Puedes editar, pero este navegador no admite WebCodecs y no podrá exportar a MP4. Para exportar, usa una
        versión reciente de Chrome, Edge, Safari (16.4+) o Firefox (130+).
      </p>
    );
  }
  return null;
}
