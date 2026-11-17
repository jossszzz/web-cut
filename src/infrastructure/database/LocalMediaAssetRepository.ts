import type { MediaAssetRepository } from "@/core/ports/repositories";
import { mediaAssetSchema, type MediaAsset } from "@/core/project/schema";

import { withStorageErrors } from "../storage/errors";
import type { WebCutDatabase } from "./db";

function parse(record: unknown): MediaAsset | null {
  const result = mediaAssetSchema.safeParse(record);
  return result.success ? result.data : null;
}

export class LocalMediaAssetRepository implements MediaAssetRepository {
  constructor(private readonly db: WebCutDatabase) {}

  save(asset: MediaAsset): Promise<void> {
    return withStorageErrors(async () => {
      await this.db.assets.put(asset);
    });
  }

  getById(id: string): Promise<MediaAsset | null> {
    return withStorageErrors(async () => parse(await this.db.assets.get(id)));
  }

  getByProject(projectId: string): Promise<MediaAsset[]> {
    return withStorageErrors(async () => {
      const records = await this.db.assets.where("projectId").equals(projectId).sortBy("createdAt");
      return records.map(parse).filter((a): a is MediaAsset => a !== null);
    });
  }

  /** Elimina el asset y sus binarios. */
  delete(id: string): Promise<void> {
    return withStorageErrors(() =>
      this.db.transaction("rw", this.db.assets, this.db.blobs, async () => {
        const asset = await this.db.assets.get(id);
        if (!asset) return;
        await this.db.blobs.bulkDelete(asset.thumbnailBlobId ? [asset.blobId, asset.thumbnailBlobId] : [asset.blobId]);
        await this.db.assets.delete(id);
      }),
    );
  }
}
