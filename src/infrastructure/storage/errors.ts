import { StorageError } from "@/core/ports/repositories";

function errorName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  return "name" in error && typeof error.name === "string" ? error.name : undefined;
}

/** Normaliza errores de IndexedDB/Dexie a `StorageError` con mensajes para el usuario. */
export function toStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const inner = typeof error === "object" && error !== null && "inner" in error ? error.inner : undefined;
  const names = [errorName(error), errorName(inner)];

  if (names.includes("QuotaExceededError")) {
    return new StorageError(
      "quota",
      "No hay espacio suficiente en el almacenamiento del navegador. Elimina medios o proyectos que no uses.",
      { cause: error },
    );
  }
  if (names.some((n) => n === "MissingAPIError" || n === "InvalidStateError" || n === "OpenFailedError")) {
    return new StorageError(
      "unavailable",
      "El almacenamiento local no está disponible (¿modo privado o datos del sitio bloqueados?).",
      { cause: error },
    );
  }
  return new StorageError("unknown", "No se pudo acceder al almacenamiento local.", { cause: error });
}

export async function withStorageErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toStorageError(error);
  }
}
