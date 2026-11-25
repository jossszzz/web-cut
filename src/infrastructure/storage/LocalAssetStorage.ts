import type { AssetStorage } from "@/core/ports/repositories";
import { createId, type IdFactory } from "@/core/project/ids";

import type { WebCutDatabase } from "../database/db";
import { withStorageErrors } from "./errors";

const isQuota = (error: unknown) =>
  error instanceof Error && (error.name === "QuotaExceededError" || /quota/i.test(error.message));

/**
 * Binarios en IndexedDB. Los `File`/`Blob` se guardan tal cual, sin copiarlos
 * a memoria. Si el navegador no admite `Blob` en IndexedDB (Safari en
 * navegación privada), se guarda su contenido como `ArrayBuffer`.
 */
export class LocalAssetStorage implements AssetStorage {
  /** Se activa tras el primer rechazo de un `Blob` para no reintentar cada vez. */
  private blobsUnsupported = false;

  constructor(
    private readonly db: WebCutDatabase,
    private readonly idFactory: IdFactory = createId,
  ) {}

  save(file: Blob): Promise<string> {
    return withStorageErrors(async () => {
      const id = this.idFactory();
      const base = { id, size: file.size, createdAt: Date.now() };
      if (!this.blobsUnsupported) {
        try {
          await this.db.blobs.add({ ...base, blob: file });
          return id;
        } catch (error) {
          if (isQuota(error)) throw error;
          console.info("[WebCut] IndexedDB no acepta Blob; se guardará como ArrayBuffer.", error);
          this.blobsUnsupported = true;
        }
      }
      await this.db.blobs.add({ ...base, data: await file.arrayBuffer(), type: file.type });
      return id;
    });
  }

  get(id: string): Promise<Blob | null> {
    return withStorageErrors(async () => {
      const record = await this.db.blobs.get(id);
      if (!record) return null;
      if (record.blob) return record.blob;
      return record.data ? new Blob([record.data], { type: record.type ?? "" }) : null;
    });
  }

  delete(id: string): Promise<void> {
    return withStorageErrors(() => this.db.blobs.delete(id));
  }
}
