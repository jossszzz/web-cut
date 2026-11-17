import type { AssetStorage } from "@/core/ports/repositories";
import { createId, type IdFactory } from "@/core/project/ids";

import type { WebCutDatabase } from "../database/db";
import { withStorageErrors } from "./errors";

/** Binarios en IndexedDB. Los `File`/`Blob` se guardan tal cual, sin copiarlos a memoria. */
export class LocalAssetStorage implements AssetStorage {
  constructor(
    private readonly db: WebCutDatabase,
    private readonly idFactory: IdFactory = createId,
  ) {}

  save(file: Blob): Promise<string> {
    return withStorageErrors(async () => {
      const id = this.idFactory();
      await this.db.blobs.add({ id, blob: file, size: file.size, createdAt: Date.now() });
      return id;
    });
  }

  get(id: string): Promise<Blob | null> {
    return withStorageErrors(async () => (await this.db.blobs.get(id))?.blob ?? null);
  }

  delete(id: string): Promise<void> {
    return withStorageErrors(() => this.db.blobs.delete(id));
  }
}
