import * as Comlink from "comlink";

import type { MediaProbe, ProbeResult } from "@/core/media/probe";
import type { MediaKind } from "@/core/project/schema";
import type { MediaWorkerApi } from "@/workers/media.worker";

import { nativeProbe } from "./nativeProbe";

/** Tras este tiempo sin trabajo, el worker se termina para liberar su memoria. */
export const MEDIA_WORKER_IDLE_MS = 30_000;

let worker: Worker | null = null;
let remote: Comlink.Remote<MediaWorkerApi> | null = null;
let pending = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Termina el worker de medios (se recrea con la siguiente importación). */
export function releaseMediaWorker(): void {
  if (pending > 0) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  worker?.terminate();
  worker = null;
  remote = null;
}

/** Crea el worker la primera vez que se necesita (Mediabunny no se carga al iniciar la app). */
function getWorker(): Comlink.Remote<MediaWorkerApi> | null {
  if (remote) return remote;
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  worker = new Worker(new URL("../../../workers/media.worker.ts", import.meta.url), {
    type: "module",
    name: "webcut-media",
  });
  remote = Comlink.wrap<MediaWorkerApi>(worker);
  return remote;
}

/**
 * Lee metadatos y genera la miniatura. Primero en el worker (WebCodecs); si el
 * navegador no soporta el contenedor/códec, recurre a los elementos nativos.
 */
export const probeMedia: MediaProbe = async (file: Blob, kind: MediaKind): Promise<ProbeResult> => {
  const api = getWorker();
  if (api) {
    pending++;
    if (idleTimer) clearTimeout(idleTimer);
    try {
      return await api.probe(file, kind);
    } catch (error) {
      console.info("[WebCut] El worker no pudo leer el archivo; usando APIs nativas.", error);
    } finally {
      pending--;
      if (pending === 0) idleTimer = setTimeout(releaseMediaWorker, MEDIA_WORKER_IDLE_MS);
    }
  }
  return nativeProbe(file, kind);
};
