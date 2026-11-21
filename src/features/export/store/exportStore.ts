import { create } from "zustand";

import type { ExportFailure, ExportProgress } from "../types";

/**
 * Estado de la exportación para la UI. Sin `Blob`/`File`: el resultado se
 * guarda como URL de objeto (la gestiona `exportService`).
 */

export type ExportStatus = "idle" | "running" | "done" | "error" | "canceled";

export interface ExportResultInfo {
  fileName: string;
  url: string;
  size: number;
  mimeType: string;
  /** Duración de la exportación en ms. */
  elapsed: number;
}

interface ExportState {
  status: ExportStatus;
  jobId: string | null;
  projectId: string | null;
  progress: ExportProgress | null;
  startedAt: number | null;
  result: ExportResultInfo | null;
  error: ExportFailure | null;
}

export const initialExportState: ExportState = {
  status: "idle",
  jobId: null,
  projectId: null,
  progress: null,
  startedAt: null,
  result: null,
  error: null,
};

export const useExportStore = create<ExportState>()(() => initialExportState);

/** Fracción completada (0–1). La finalización cuenta como el último 2 %. */
export function progressFraction(progress: ExportProgress | null): number {
  if (!progress || progress.totalFrames === 0) return 0;
  if (progress.phase === "finalizing") return 0.99;
  return (progress.frame / progress.totalFrames) * 0.98;
}

/** Tiempo restante estimado en ms, o `null` si aún no hay datos suficientes. */
export function estimateRemaining(progress: ExportProgress | null, startedAt: number | null, now: number): number | null {
  if (!progress || !startedAt || progress.phase !== "rendering" || progress.frame < 5) return null;
  const elapsed = now - startedAt;
  return (elapsed / progress.frame) * (progress.totalFrames - progress.frame);
}
