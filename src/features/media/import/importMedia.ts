import { MediaProbeError, type MediaProbe } from "@/core/media/probe";
import { classifyFile } from "@/core/media/validation";
import { StorageError, type AssetStorage, type MediaAssetRepository } from "@/core/ports/repositories";
import { createId, type IdFactory } from "@/core/project/ids";
import type { MediaAsset } from "@/core/project/schema";

export type ImportStage = "validating" | "reading" | "saving";

export interface ImportDeps {
  probe: MediaProbe;
  blobs: AssetStorage;
  assets: MediaAssetRepository;
  ensureSpaceFor: (bytes: number) => Promise<void>;
  idFactory?: IdFactory;
  now?: () => number;
}

export interface ImportOptions {
  signal?: AbortSignal;
  onStage?: (stage: ImportStage) => void;
}

/** Error de importación con mensaje apto para mostrar al usuario. */
export class ImportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ImportError";
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Importación cancelada", "AbortError");
}

/**
 * Importa un archivo: valida → comprueba espacio → lee metadatos y miniatura →
 * guarda binarios y metadatos. Si algo falla tras guardar binarios, los elimina
 * para no dejar datos huérfanos.
 */
export async function importMediaFile(
  file: File,
  projectId: string,
  deps: ImportDeps,
  { signal, onStage }: ImportOptions = {},
): Promise<MediaAsset> {
  const idFactory = deps.idFactory ?? createId;
  const now = deps.now ?? Date.now;

  onStage?.("validating");
  const validation = classifyFile(file);
  if (!validation.ok) throw new ImportError(validation.reason);
  const { kind } = validation;

  try {
    await deps.ensureSpaceFor(file.size);
  } catch (error) {
    throw new ImportError(error instanceof StorageError ? error.message : "No se pudo comprobar el espacio disponible.", {
      cause: error,
    });
  }
  throwIfAborted(signal);

  onStage?.("reading");
  let probe;
  try {
    probe = await deps.probe(file, kind);
  } catch (error) {
    throw new ImportError(
      error instanceof MediaProbeError ? error.message : "No se pudieron leer los metadatos del archivo.",
      { cause: error },
    );
  }
  if (kind !== "image" && !probe.duration) {
    throw new ImportError("No se pudo determinar la duración del archivo.");
  }
  throwIfAborted(signal);

  onStage?.("saving");
  const savedBlobIds: string[] = [];
  try {
    const blobId = await deps.blobs.save(file);
    savedBlobIds.push(blobId);
    const thumbnailBlobId = probe.thumbnail ? await deps.blobs.save(probe.thumbnail) : undefined;
    if (thumbnailBlobId) savedBlobIds.push(thumbnailBlobId);
    throwIfAborted(signal);

    const asset: MediaAsset = {
      id: idFactory(),
      projectId,
      kind,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      hasAudio: probe.hasAudio,
      blobId,
      createdAt: now(),
      ...(probe.duration !== undefined && { duration: probe.duration }),
      ...(probe.width !== undefined && { width: probe.width }),
      ...(probe.height !== undefined && { height: probe.height }),
      ...(thumbnailBlobId && { thumbnailBlobId }),
    };
    await deps.assets.save(asset);
    return asset;
  } catch (error) {
    await Promise.allSettled(savedBlobIds.map((id) => deps.blobs.delete(id)));
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ImportError(error instanceof StorageError ? error.message : "No se pudo guardar el archivo.", {
      cause: error,
    });
  }
}
