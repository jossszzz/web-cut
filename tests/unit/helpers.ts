import type { IdFactory } from "@/core/project/ids";

/** Generador de IDs determinista para pruebas. */
export function sequentialIds(prefix = "id"): IdFactory {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
