import { createId } from "@/core/project/ids";
import { getRepositories } from "@/infrastructure";
import { ensureSpaceFor, requestPersistentStorage } from "@/infrastructure/browser/storageQuota";

import { probeMedia } from "../metadata/mediaProbe";
import { useMediaStore } from "../store/mediaStore";
import { importMediaFile } from "./importMedia";

/** Controladores de cancelación por trabajo (fuera de Zustand: no son serializables). */
const controllers = new Map<string, AbortController>();
let queue: Promise<void> = Promise.resolve();

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function runJob(jobId: string, file: File, projectId: string): Promise<void> {
  const store = useMediaStore.getState();
  const controller = controllers.get(jobId);
  if (!controller || controller.signal.aborted) return;
  const { blobs, assets } = getRepositories();

  try {
    const asset = await importMediaFile(
      file,
      projectId,
      { probe: probeMedia, blobs, assets, ensureSpaceFor },
      { signal: controller.signal, onStage: (stage) => store.updateJob(jobId, { stage }) },
    );
    useMediaStore.getState().addAsset(asset);
    useMediaStore.getState().removeJob(jobId);
  } catch (error) {
    if (isAbort(error)) {
      useMediaStore.getState().removeJob(jobId);
    } else {
      const message = error instanceof Error ? error.message : "Error desconocido al importar.";
      useMediaStore.getState().updateJob(jobId, { error: message });
    }
  } finally {
    controllers.delete(jobId);
  }
}

/**
 * Encola archivos para importarlos de uno en uno (evita picos de memoria y de
 * trabajo del decodificador con lotes grandes).
 */
export function importFiles(files: Iterable<File>, projectId: string): void {
  void requestPersistentStorage();
  const store = useMediaStore.getState();
  for (const file of files) {
    const jobId = createId();
    controllers.set(jobId, new AbortController());
    store.upsertJob({ id: jobId, fileName: file.name, size: file.size, stage: "queued" });
    queue = queue.then(() => runJob(jobId, file, projectId));
  }
}

export function cancelImport(jobId: string): void {
  const controller = controllers.get(jobId);
  if (controller) controller.abort();
  // Trabajos en cola o con error: se quitan directamente.
  const job = useMediaStore.getState().importJobs.find((j) => j.id === jobId);
  if (job && (job.stage === "queued" || job.error)) useMediaStore.getState().removeJob(jobId);
}

/** Cancela todo lo pendiente (p. ej. al cambiar de proyecto). */
export function cancelAllImports(): void {
  for (const controller of controllers.values()) controller.abort();
}
