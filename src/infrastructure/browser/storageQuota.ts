import { formatBytes } from "@/core/media/validation";
import { StorageError } from "@/core/ports/repositories";

export interface StorageEstimate {
  usage: number;
  quota: number;
  persisted: boolean;
}

/** Margen que se deja libre para no llegar al límite exacto de la cuota. */
const SAFETY_MARGIN = 0.9;

export async function estimateStorage(): Promise<StorageEstimate | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const [{ usage = 0, quota = 0 }, persisted] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted?.() ?? Promise.resolve(false),
    ]);
    return { usage, quota, persisted };
  } catch {
    return null;
  }
}

/** Lanza `StorageError("quota")` si previsiblemente no caben `bytes` más. */
export async function ensureSpaceFor(bytes: number): Promise<void> {
  const estimate = await estimateStorage();
  if (!estimate || estimate.quota === 0) return; // Sin información: lo decidirá IndexedDB.
  const available = estimate.quota * SAFETY_MARGIN - estimate.usage;
  if (bytes > available) {
    throw new StorageError(
      "quota",
      `No hay espacio suficiente: el archivo ocupa ${formatBytes(bytes)} y quedan unos ${formatBytes(Math.max(0, available))} disponibles.`,
    );
  }
}

/**
 * Pide al navegador que no borre los datos del sitio bajo presión de espacio.
 * IndexedDB no es almacenamiento garantizado sin este permiso.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
