import Dexie, { type EntityTable } from "dexie";

import type { MediaAsset, Project } from "@/core/project/schema";

export interface BlobRecord {
  id: string;
  /** El archivo tal cual (lo normal). */
  blob?: Blob;
  /**
   * Respaldo para navegadores que no guardan `Blob` en IndexedDB (WebKit en
   * sesiones efímeras o navegación privada): el contenido como `ArrayBuffer`.
   */
  data?: ArrayBuffer;
  type?: string;
  size: number;
  createdAt: number;
}

/**
 * Base de datos local (IndexedDB vía Dexie).
 *
 * - `projects`: documentos de proyecto (JSON, validados con Zod al leer).
 * - `assets`: metadatos de medios importados, indexados por proyecto.
 * - `blobs`: binarios (archivos originales y miniaturas). Nunca pasan por Zustand.
 */
export class WebCutDatabase extends Dexie {
  projects!: EntityTable<Project, "id">;
  assets!: EntityTable<MediaAsset, "id">;
  blobs!: EntityTable<BlobRecord, "id">;

  constructor(name = "webcut-studio") {
    super(name);
    this.version(1).stores({
      projects: "id, updatedAt",
      assets: "id, projectId, createdAt",
      blobs: "id",
    });
  }
}
