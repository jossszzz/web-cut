import type { ProjectRepository } from "@/core/ports/repositories";
import { projectSchema, type Project } from "@/core/project/schema";

import { withStorageErrors } from "../storage/errors";
import type { WebCutDatabase } from "./db";

function parse(record: unknown): Project | null {
  const result = projectSchema.safeParse(record);
  if (!result.success) {
    console.warn("[WebCut] Proyecto con formato no válido ignorado", result.error.issues);
    return null;
  }
  return result.data;
}

export class LocalProjectRepository implements ProjectRepository {
  constructor(private readonly db: WebCutDatabase) {}

  save(project: Project): Promise<void> {
    return withStorageErrors(async () => {
      await this.db.projects.put(project);
    });
  }

  getById(id: string): Promise<Project | null> {
    return withStorageErrors(async () => {
      const record = await this.db.projects.get(id);
      return record ? parse(record) : null;
    });
  }

  getAll(): Promise<Project[]> {
    return withStorageErrors(async () => {
      const records = await this.db.projects.orderBy("updatedAt").reverse().toArray();
      return records.map(parse).filter((p): p is Project => p !== null);
    });
  }

  /** Elimina el proyecto junto con sus assets y binarios, de forma atómica. */
  delete(id: string): Promise<void> {
    return withStorageErrors(() =>
      this.db.transaction("rw", this.db.projects, this.db.assets, this.db.blobs, async () => {
        const assets = await this.db.assets.where("projectId").equals(id).toArray();
        const blobIds = assets.flatMap((a) => (a.thumbnailBlobId ? [a.blobId, a.thumbnailBlobId] : [a.blobId]));
        await this.db.blobs.bulkDelete(blobIds);
        await this.db.assets.bulkDelete(assets.map((a) => a.id));
        await this.db.projects.delete(id);
      }),
    );
  }
}
