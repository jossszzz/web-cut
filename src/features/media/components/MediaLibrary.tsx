"use client";

import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Biblioteca multimedia. En el Sprint 1 solo muestra el estado vacío; la
 * importación (validación, metadatos, miniaturas, IndexedDB) es la Fase 2.
 */
export function MediaLibrary() {
  return (
    <div className="flex flex-col gap-3">
      <Button variant="secondary" disabled className="w-full">
        <Upload data-icon="inline-start" />
        Importar medios
      </Button>
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
        <Upload className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Aún no hay medios</p>
        <p className="text-xs text-muted-foreground">
          La importación de video, imagen y audio llega en la Fase 2. Mientras tanto, prueba el
          proyecto de demostración o añade texto.
        </p>
      </div>
    </div>
  );
}
