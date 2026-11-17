import { describe, expect, it, vi } from "vitest";

import { MediaProbeError, type MediaProbe } from "@/core/media/probe";
import { StorageError, type AssetStorage, type MediaAssetRepository } from "@/core/ports/repositories";
import type { MediaAsset } from "@/core/project/schema";
import { secondsToUs } from "@/core/types/time";
import { ImportError, importMediaFile, type ImportDeps } from "@/features/media/import/importMedia";

import { sequentialIds } from "./helpers";

function memoryBlobs(): AssetStorage & { store: Map<string, Blob> } {
  const store = new Map<string, Blob>();
  const ids = sequentialIds("blob");
  return {
    store,
    save: async (blob) => {
      const id = ids();
      store.set(id, blob);
      return id;
    },
    get: async (id) => store.get(id) ?? null,
    delete: async (id) => void store.delete(id),
  };
}

function memoryAssets(): MediaAssetRepository & { store: Map<string, MediaAsset> } {
  const store = new Map<string, MediaAsset>();
  return {
    store,
    save: async (a) => void store.set(a.id, a),
    getById: async (id) => store.get(id) ?? null,
    getByProject: async (pid) => [...store.values()].filter((a) => a.projectId === pid),
    delete: async (id) => void store.delete(id),
  };
}

const videoProbe: MediaProbe = async () => ({
  duration: secondsToUs(4),
  width: 1280,
  height: 720,
  hasAudio: true,
  thumbnail: new Blob(["jpg"], { type: "image/jpeg" }),
});

function deps(overrides: Partial<ImportDeps> = {}) {
  const blobs = memoryBlobs();
  const assets = memoryAssets();
  return {
    blobs,
    assets,
    deps: {
      probe: videoProbe,
      blobs,
      assets,
      ensureSpaceFor: async () => {},
      idFactory: () => "asset-1",
      now: () => 42,
      ...overrides,
    } satisfies ImportDeps,
  };
}

const video = () => new File(["contenido"], "clip.mp4", { type: "video/mp4" });

describe("importMediaFile", () => {
  it("valida, lee metadatos y guarda binario, miniatura y metadatos", async () => {
    const { deps: d, blobs, assets } = deps();
    const stages: string[] = [];
    const asset = await importMediaFile(video(), "p1", d, { onStage: (s) => stages.push(s) });

    expect(stages).toEqual(["validating", "reading", "saving"]);
    expect(asset).toEqual({
      id: "asset-1",
      projectId: "p1",
      kind: "video",
      name: "clip.mp4",
      mimeType: "video/mp4",
      size: 9,
      duration: secondsToUs(4),
      width: 1280,
      height: 720,
      hasAudio: true,
      blobId: "blob-1",
      thumbnailBlobId: "blob-2",
      createdAt: 42,
    });
    expect(blobs.store.size).toBe(2);
    expect(assets.store.get("asset-1")).toEqual(asset);
  });

  it("rechaza archivos no válidos sin leerlos", async () => {
    const probe = vi.fn(videoProbe);
    const { deps: d } = deps({ probe });
    await expect(importMediaFile(new File(["x"], "a.txt", { type: "text/plain" }), "p1", d)).rejects.toBeInstanceOf(
      ImportError,
    );
    expect(probe).not.toHaveBeenCalled();
  });

  it("informa la falta de espacio antes de leer", async () => {
    const { deps: d } = deps({
      ensureSpaceFor: async () => {
        throw new StorageError("quota", "No hay espacio suficiente.");
      },
    });
    await expect(importMediaFile(video(), "p1", d)).rejects.toThrow("No hay espacio suficiente.");
  });

  it("muestra el mensaje del lector de medios cuando no se puede decodificar", async () => {
    const { deps: d } = deps({
      probe: async () => {
        throw new MediaProbeError("El navegador no puede leer este archivo.");
      },
    });
    await expect(importMediaFile(video(), "p1", d)).rejects.toThrow("El navegador no puede leer este archivo.");
  });

  it("exige duración en audio y video", async () => {
    const { deps: d } = deps({ probe: async () => ({ hasAudio: true }) });
    await expect(importMediaFile(video(), "p1", d)).rejects.toThrow("duración");
  });

  it("elimina los binarios guardados si falla el guardado de metadatos (p. ej. cuota)", async () => {
    const { deps: d, blobs } = deps();
    d.assets.save = async () => {
      throw new StorageError("quota", "Sin espacio en IndexedDB.");
    };
    await expect(importMediaFile(video(), "p1", d)).rejects.toThrow("Sin espacio en IndexedDB.");
    expect(blobs.store.size).toBe(0);
  });

  it("se puede cancelar sin dejar datos", async () => {
    const controller = new AbortController();
    const { deps: d, blobs, assets } = deps({
      probe: async (...args) => {
        controller.abort();
        return videoProbe(...args);
      },
    });
    await expect(importMediaFile(video(), "p1", d, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(blobs.store.size).toBe(0);
    expect(assets.store.size).toBe(0);
  });
});
