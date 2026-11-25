import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * `false` en el HTML del servidor y durante la hidratación; `true` después.
 * Sirve para no aceptar interacción antes de que React gestione el formulario
 * (lo escrito se perdería o el formulario se enviaría de forma nativa).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
