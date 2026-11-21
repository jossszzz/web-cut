/// <reference lib="webworker" />
import type { StreamTargetChunk } from "mediabunny";

import { EXPORT_DIRECTORY } from "../types";

/**
 * Archivo de salida en el Origin Private File System. El worker escribe con
 * un `FileSystemSyncAccessHandle` (escrituras posicionadas y síncronas), así
 * un video largo no tiene que caber en memoria.
 */

export interface DiskFile {
  name: string;
  writable: WritableStream<StreamTargetChunk>;
  size(): Promise<number>;
  /** Cierra y elimina el archivo (al cancelar o fallar). */
  discard(): Promise<void>;
}

/** ¿Se puede escribir en OPFS desde este worker? */
export function canStreamToDisk(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function" &&
    typeof FileSystemFileHandle !== "undefined" &&
    "createSyncAccessHandle" in FileSystemFileHandle.prototype
  );
}

async function exportDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(EXPORT_DIRECTORY, { create: true });
}

/** Elimina exportaciones anteriores (solo se conserva la última, hasta descargarla). */
export async function clearDiskExports(): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(EXPORT_DIRECTORY, { recursive: true });
  } catch {
    // No existía o está en uso: no es un problema.
  }
}

export async function openDiskFile(name: string): Promise<DiskFile> {
  const directory = await exportDirectory();
  const handle = await directory.getFileHandle(name, { create: true });
  const access = await handle.createSyncAccessHandle();
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    access.flush();
    access.close();
  };

  const writable = new WritableStream<StreamTargetChunk>({
    write(chunk) {
      access.write(chunk.data, { at: chunk.position });
    },
    close,
    abort: close,
  });

  return {
    name,
    writable,
    async size() {
      close();
      return (await handle.getFile()).size;
    },
    async discard() {
      try {
        close();
      } catch {
        // Ya estaba cerrado.
      }
      await directory.removeEntry(name).catch(() => undefined);
    },
  };
}
