import type { AssetStorage, MediaAssetRepository, ProjectRepository } from "@/core/ports/repositories";

import { WebCutDatabase } from "./database/db";
import { LocalMediaAssetRepository } from "./database/LocalMediaAssetRepository";
import { LocalProjectRepository } from "./database/LocalProjectRepository";
import { LocalAssetStorage } from "./storage/LocalAssetStorage";

export interface Repositories {
  projects: ProjectRepository;
  assets: MediaAssetRepository;
  blobs: AssetStorage;
}

let instance: Repositories | null = null;

/**
 * Implementaciones locales de los repositorios (singleton perezoso, solo en
 * el cliente). Para sustituirlas por adaptadores cloud bastará con cambiar
 * este punto de composición.
 */
export function getRepositories(): Repositories {
  if (typeof window === "undefined") {
    throw new Error("Los repositorios locales solo están disponibles en el navegador.");
  }
  if (!instance) instance = createLocalRepositories(new WebCutDatabase());
  return instance;
}

export function createLocalRepositories(db: WebCutDatabase): Repositories {
  return {
    projects: new LocalProjectRepository(db),
    assets: new LocalMediaAssetRepository(db),
    blobs: new LocalAssetStorage(db),
  };
}
