import type { MediaAsset, Project } from "../project/schema";

/**
 * Contratos de persistencia. Las implementaciones locales (IndexedDB) viven en
 * `infrastructure/`; en el futuro podrán añadirse adaptadores cloud sin tocar
 * el editor.
 */

export interface ProjectRepository {
  save(project: Project): Promise<void>;
  getById(id: string): Promise<Project | null>;
  getAll(): Promise<Project[]>;
  delete(id: string): Promise<void>;
}

/** Almacén de binarios (archivos originales y miniaturas). */
export interface AssetStorage {
  save(file: Blob): Promise<string>;
  get(id: string): Promise<Blob | null>;
  delete(id: string): Promise<void>;
}

export interface MediaAssetRepository {
  save(asset: MediaAsset): Promise<void>;
  getById(id: string): Promise<MediaAsset | null>;
  getByProject(projectId: string): Promise<MediaAsset[]>;
  delete(id: string): Promise<void>;
}

export type StorageErrorCode = "quota" | "unavailable" | "unknown";

export class StorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "StorageError";
  }
}
