"use client";

import * as Comlink from "comlink";

import { planExport } from "@/core/export/plan";
import { computeOutputSize, exportFileName, type ExportSettings } from "@/core/export/settings";
import { createId } from "@/core/project/ids";
import type { MediaAsset, Project } from "@/core/project/schema";
import { getRepositories } from "@/infrastructure";
import type { ExportWorkerApi } from "@/workers/export.worker";

import { renderStaticLayers } from "./staticLayers";
import { initialExportState, useExportStore } from "./store/exportStore";
import { EXPORT_DIRECTORY, type ExportCapabilities, type ExportJob, type ExportOutcome } from "./types";

/**
 * Orquesta la exportación desde el hilo principal: prepara el trabajo
 * (archivos y capas estáticas), lo envía al worker, refleja el progreso en
 * `useExportStore` y gestiona el archivo resultante.
 */

let worker: Worker | null = null;
let remote: Comlink.Remote<ExportWorkerApi> | null = null;
let resultUrl: string | null = null;

/** Si el worker no responde a la cancelación en este tiempo, se termina. */
const CANCEL_TIMEOUT_MS = 5_000;

/** Termina el worker (se recrea en la siguiente exportación) y libera su memoria. */
function terminateWorker(): void {
  worker?.terminate();
  worker = null;
  remote = null;
}

/** Marca como fallida/cancelada una exportación cuyo worker ya no responde. */
function abandonJob(status: "error" | "canceled", message: string): void {
  if (useExportStore.getState().status !== "running") return;
  terminateWorker();
  useExportStore.setState({ status, error: { code: status === "canceled" ? "canceled" : "unknown", message } });
  window.removeEventListener("beforeunload", warnBeforeLeaving);
}

/** El worker (y Mediabunny) se cargan solo al abrir el diálogo de exportación. */
function getWorker(): Comlink.Remote<ExportWorkerApi> | null {
  if (remote) return remote;
  if (typeof Worker === "undefined") return null;
  worker = new Worker(new URL("../../workers/export.worker.ts", import.meta.url), {
    type: "module",
    name: "webcut-export",
  });
  // Un fallo fatal (p. ej. sin memoria) no rechaza la llamada de Comlink: hay que detectarlo aquí.
  worker.addEventListener("error", (event) => {
    console.error("[WebCut] El worker de exportación se detuvo", event.message);
    abandonJob(
      "error",
      "El proceso de exportación se detuvo, posiblemente por falta de memoria. Prueba con una resolución menor y cierra otras pestañas.",
    );
    terminateWorker();
  });
  remote = Comlink.wrap<ExportWorkerApi>(worker);
  return remote;
}

const UNSUPPORTED: ExportCapabilities = { webCodecs: false, videoCodec: null, audioCodec: null, streamToDisk: false };

export async function detectCapabilities(project: Project, settings: ExportSettings): Promise<ExportCapabilities> {
  const worker = getWorker();
  if (!worker || typeof VideoEncoder === "undefined") return UNSUPPORTED;
  const { width, height } = computeOutputSize(project, settings.resolution);
  try {
    return await worker.capabilities({ width, height, fps: settings.fps, quality: settings.quality });
  } catch (error) {
    console.warn("[WebCut] No se pudieron detectar las capacidades de exportación", error);
    return UNSUPPORTED;
  }
}

function warnBeforeLeaving(event: BeforeUnloadEvent): void {
  event.preventDefault();
}

function releaseResult(): void {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;
}

async function readOutcomeFile(outcome: Extract<ExportOutcome, { ok: true }>, fileName: string): Promise<File> {
  if (outcome.storage === "memory") return new File([outcome.buffer], fileName, { type: "video/mp4" });
  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(EXPORT_DIRECTORY);
  const file = await (await directory.getFileHandle(outcome.fileName)).getFile();
  return file;
}

export async function startExport(
  project: Project,
  assets: Readonly<Record<string, MediaAsset>>,
  settings: ExportSettings,
  capabilities: ExportCapabilities,
): Promise<void> {
  const worker = getWorker();
  if (!worker || !capabilities.videoCodec) return;
  if (useExportStore.getState().status === "running") return;
  releaseResult();

  const id = createId();
  const startedAt = performance.now();
  useExportStore.setState({ ...initialExportState, status: "running", jobId: id, projectId: project.id, startedAt });
  window.addEventListener("beforeunload", warnBeforeLeaving);

  try {
    const { width, height } = computeOutputSize(project, settings.resolution);
    const plan = planExport(project, assets);
    const blobs: Record<string, Blob> = {};
    for (const assetId of plan.assetIds) {
      const asset = assets[assetId];
      const blob = asset ? await getRepositories().blobs.get(asset.blobId) : undefined;
      if (blob) blobs[assetId] = blob;
    }
    const staticLayers = await renderStaticLayers(project, assets, width);
    const job: ExportJob = {
      id,
      project,
      assets: { ...assets },
      blobs,
      staticLayers,
      settings,
      width,
      height,
      videoCodec: capabilities.videoCodec,
      audioCodec: capabilities.audioCodec,
      streamToDisk: capabilities.streamToDisk,
    };

    const outcome = await worker.export(
      Comlink.transfer(job, staticLayers.map((l) => l.bitmap)),
      Comlink.proxy((progress) => {
        if (useExportStore.getState().jobId === id) useExportStore.setState({ progress });
      }),
    );
    if (useExportStore.getState().jobId !== id) return;

    if (!outcome.ok) {
      useExportStore.setState({ status: outcome.error.code === "canceled" ? "canceled" : "error", error: outcome.error });
      return;
    }
    const fileName = exportFileName(project.name);
    const file = await readOutcomeFile(outcome, fileName);
    resultUrl = URL.createObjectURL(file);
    useExportStore.setState({
      status: "done",
      result: { fileName, url: resultUrl, size: file.size, mimeType: outcome.mimeType, elapsed: performance.now() - startedAt },
    });
  } catch (error) {
    console.error("[WebCut] La exportación falló", error);
    useExportStore.setState({
      status: "error",
      error: { code: "unknown", message: "La exportación se interrumpió inesperadamente.", detail: String(error) },
    });
  } finally {
    window.removeEventListener("beforeunload", warnBeforeLeaving);
  }
}

export function cancelExport(): void {
  const { jobId, status } = useExportStore.getState();
  if (status !== "running" || !jobId) return;
  void remote?.cancel(jobId);
  setTimeout(() => {
    if (useExportStore.getState().jobId === jobId) abandonJob("canceled", "Exportación cancelada.");
  }, CANCEL_TIMEOUT_MS);
}

/** Descarga el último archivo exportado. */
export function downloadExport(): void {
  const result = useExportStore.getState().result;
  if (!result) return;
  const link = document.createElement("a");
  link.href = result.url;
  link.download = result.fileName;
  document.body.append(link);
  link.click();
  link.remove();
}

/** Margen para que una descarga recién iniciada termine de leer el archivo. */
const RELEASE_DELAY_MS = 30_000;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
/** URL del resultado anterior pendiente de revocar. */
let pendingUrl: string | null = null;

function flushPendingRelease(): void {
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = null;
  if (pendingUrl) URL.revokeObjectURL(pendingUrl);
  pendingUrl = null;
}

/** Vuelve al formulario y libera el archivo anterior (memoria y OPFS) poco después. */
export function resetExport(): void {
  if (useExportStore.getState().status === "running") return;
  const url = resultUrl;
  resultUrl = null;
  useExportStore.setState(initialExportState);
  if (!url) return;
  flushPendingRelease();
  pendingUrl = url;
  releaseTimer = setTimeout(() => {
    flushPendingRelease();
    if (useExportStore.getState().status !== "running") void remote?.clear().catch(() => undefined);
  }, RELEASE_DELAY_MS);
}

/**
 * Libera todo lo de la exportación al salir del editor: el archivo exportado
 * (URL y OPFS) y el worker. Si hay una exportación en curso, sigue adelante.
 */
export function releaseExportResources(): void {
  if (useExportStore.getState().status === "running") return;
  flushPendingRelease();
  const api = remote;
  releaseResult();
  useExportStore.setState(initialExportState);
  void api
    ?.clear()
    .catch(() => undefined)
    .finally(terminateWorker);
}
