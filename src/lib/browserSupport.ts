/**
 * Detección de las APIs del navegador que necesita WebCut. Se comprueba la
 * existencia de cada API (no el nombre del navegador).
 */

export interface BrowserSupport {
  /** IndexedDB: proyectos y medios. Imprescindible. */
  indexedDb: boolean;
  /** Web Workers: importación y exportación fuera del hilo principal. Imprescindible. */
  workers: boolean;
  /** Canvas 2D: preview y timeline. Imprescindible. */
  canvas: boolean;
  /** OffscreenCanvas: miniaturas y exportación en workers. */
  offscreenCanvas: boolean;
  /** WebCodecs (VideoEncoder): exportación. */
  webCodecs: boolean;
}

export function detectBrowserSupport(scope: typeof globalThis = globalThis): BrowserSupport {
  const has = (name: string) => typeof (scope as unknown as Record<string, unknown>)[name] !== "undefined";
  let canvas = false;
  try {
    canvas = has("document") && Boolean(scope.document.createElement("canvas").getContext("2d"));
  } catch {
    canvas = false;
  }
  return {
    indexedDb: has("indexedDB"),
    workers: has("Worker"),
    canvas,
    offscreenCanvas: has("OffscreenCanvas"),
    webCodecs: has("VideoEncoder") && has("VideoDecoder"),
  };
}

/** Funciones esenciales que faltan (con nombre legible). */
export function missingEssentials(support: BrowserSupport): string[] {
  const missing: string[] = [];
  if (!support.indexedDb) missing.push("almacenamiento local (IndexedDB)");
  if (!support.workers) missing.push("Web Workers");
  if (!support.canvas) missing.push("Canvas 2D");
  return missing;
}

export function canExport(support: BrowserSupport): boolean {
  return support.webCodecs && support.offscreenCanvas && support.workers;
}
