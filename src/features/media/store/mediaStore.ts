import { create } from "zustand";

import type { MediaAsset } from "@/core/project/schema";

import type { ImportStage } from "../import/importMedia";

export interface ImportJob {
  id: string;
  fileName: string;
  size: number;
  stage: "queued" | ImportStage;
  error?: string;
}

/**
 * Biblioteca del proyecto activo: solo metadatos serializables. Los binarios
 * y miniaturas se leen de IndexedDB cuando se necesitan.
 */
interface MediaState {
  projectId: string | null;
  assets: Record<string, MediaAsset>;
  status: "idle" | "loading" | "ready" | "error";
  importJobs: ImportJob[];

  setLibrary(projectId: string, assets: MediaAsset[]): void;
  setStatus(status: MediaState["status"]): void;
  addAsset(asset: MediaAsset): void;
  removeAsset(assetId: string): void;
  upsertJob(job: ImportJob): void;
  updateJob(jobId: string, patch: Partial<ImportJob>): void;
  removeJob(jobId: string): void;
}

export const useMediaStore = create<MediaState>()((set) => ({
  projectId: null,
  assets: {},
  status: "idle",
  importJobs: [],

  setLibrary: (projectId, assets) =>
    set({
      projectId,
      assets: Object.fromEntries(assets.map((a) => [a.id, a])),
      status: "ready",
      importJobs: [],
    }),
  setStatus: (status) => set({ status }),
  addAsset: (asset) =>
    set((state) =>
      state.projectId === asset.projectId ? { assets: { ...state.assets, [asset.id]: asset } } : state,
    ),
  removeAsset: (assetId) =>
    set((state) => {
      const assets = { ...state.assets };
      delete assets[assetId];
      return { assets };
    }),
  upsertJob: (job) =>
    set((state) => ({ importJobs: [...state.importJobs.filter((j) => j.id !== job.id), job] })),
  updateJob: (jobId, patch) =>
    set((state) => ({ importJobs: state.importJobs.map((j) => (j.id === jobId ? { ...j, ...patch } : j)) })),
  removeJob: (jobId) => set((state) => ({ importJobs: state.importJobs.filter((j) => j.id !== jobId) })),
}));

/** Lista ordenada por fecha de importación. Usar con `useMemo` (crea un array nuevo). */
export const sortAssets = (assets: Record<string, MediaAsset>): MediaAsset[] =>
  Object.values(assets).sort((a, b) => a.createdAt - b.createdAt);
