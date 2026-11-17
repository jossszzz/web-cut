import * as Comlink from "comlink";

import type { MediaProbe, ProbeResult } from "@/core/media/probe";
import type { MediaKind } from "@/core/project/schema";
import type { MediaWorkerApi } from "@/workers/media.worker";

import { nativeProbe } from "./nativeProbe";

let remote: Comlink.Remote<MediaWorkerApi> | null = null;

/** Crea el worker la primera vez que se necesita (Mediabunny no se carga al iniciar la app). */
function getWorker(): Comlink.Remote<MediaWorkerApi> | null {
  if (remote) return remote;
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  const worker = new Worker(new URL("../../../workers/media.worker.ts", import.meta.url), {
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
  const worker = getWorker();
  if (worker) {
    try {
      return await worker.probe(file, kind);
    } catch (error) {
      console.info("[WebCut] El worker no pudo leer el archivo; usando APIs nativas.", error);
    }
  }
  return nativeProbe(file, kind);
};
