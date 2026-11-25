import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StorageError } from "@/core/ports/repositories";
import { createDemoProject, createEmptyProject } from "@/core/project/factory";
import type { MediaAsset } from "@/core/project/schema";
import { createLocalRepositories, type Repositories } from "@/infrastructure";
import { WebCutDatabase } from "@/infrastructure/database/db";
import { toStorageError } from "@/infrastructure/storage/errors";

let db: WebCutDatabase;
let repos: Repositories;

beforeEach(() => {
  db = new WebCutDatabase(`test-${crypto.randomUUID()}`);
  repos = createLocalRepositories(db);
});

afterEach(async () => {
  await db.delete();
});

function assetFor(projectId: string, blobId: string, thumbnailBlobId?: string): MediaAsset {
  return {
    id: crypto.randomUUID(),
    projectId,
    kind: "image",
    name: "foto.png",
    mimeType: "image/png",
    size: 3,
    width: 10,
    height: 10,
    hasAudio: false,
    blobId,
    createdAt: Date.now(),
    ...(thumbnailBlobId && { thumbnailBlobId }),
  };
}

describe("LocalProjectRepository", () => {
  it("guarda, recupera y lista ordenando por última edición", async () => {
    const older = createEmptyProject({ name: "Viejo", now: 1 });
    const newer = createDemoProject({ name: "Nuevo", now: 2 });
    await repos.projects.save(older);
    await repos.projects.save(newer);

    expect(await repos.projects.getById(newer.id)).toEqual(newer);
    expect((await repos.projects.getAll()).map((p) => p.name)).toEqual(["Nuevo", "Viejo"]);
    expect(await repos.projects.getById("no-existe")).toBeNull();
  });

  it("ignora registros con formato no válido", async () => {
    await db.projects.put({ id: "roto", name: "" } as never);
    await repos.projects.save(createEmptyProject({ name: "Bien" }));
    expect((await repos.projects.getAll()).map((p) => p.name)).toEqual(["Bien"]);
    expect(await repos.projects.getById("roto")).toBeNull();
  });

  it("al eliminar un proyecto borra sus assets y binarios, y no los de otros", async () => {
    const a = createEmptyProject({ name: "A" });
    const b = createEmptyProject({ name: "B" });
    await repos.projects.save(a);
    await repos.projects.save(b);
    const blobA = await repos.blobs.save(new Blob(["aaa"]));
    const thumbA = await repos.blobs.save(new Blob(["t"]));
    const blobB = await repos.blobs.save(new Blob(["bbb"]));
    await repos.assets.save(assetFor(a.id, blobA, thumbA));
    await repos.assets.save(assetFor(b.id, blobB));

    await repos.projects.delete(a.id);

    expect(await repos.projects.getById(a.id)).toBeNull();
    expect(await repos.assets.getByProject(a.id)).toEqual([]);
    expect(await repos.blobs.get(blobA)).toBeNull();
    expect(await repos.blobs.get(thumbA)).toBeNull();
    expect(await repos.assets.getByProject(b.id)).toHaveLength(1);
    expect(await repos.blobs.get(blobB)).not.toBeNull();
  });
});

describe("LocalAssetStorage y LocalMediaAssetRepository", () => {
  it("guarda y recupera binarios", async () => {
    const id = await repos.blobs.save(new Blob(["hola"], { type: "text/plain" }));
    const blob = await repos.blobs.get(id);
    expect(await blob?.text()).toBe("hola");
    await repos.blobs.delete(id);
    expect(await repos.blobs.get(id)).toBeNull();
  });

  it("si IndexedDB rechaza Blob (Safari privado), guarda el contenido como ArrayBuffer", async () => {
    const original = db.blobs.add.bind(db.blobs);
    let rejected = 0;
    db.blobs.add = ((record: Parameters<typeof original>[0]) => {
      if (record.blob) {
        rejected++;
        return Promise.reject(new DOMException("Error preparing Blob data", "UnknownError"));
      }
      return original(record);
    }) as typeof db.blobs.add;

    const first = await repos.blobs.save(new Blob(["uno"], { type: "text/plain" }));
    const second = await repos.blobs.save(new Blob(["dos"]));
    expect(rejected).toBe(1); // no lo reintenta con cada archivo
    const blob = await repos.blobs.get(first);
    expect(blob?.type).toBe("text/plain");
    expect(await blob?.text()).toBe("uno");
    expect(await (await repos.blobs.get(second))?.text()).toBe("dos");
  });

  it("lista assets por proyecto y al eliminarlos borra sus binarios", async () => {
    const blobId = await repos.blobs.save(new Blob(["x"]));
    const asset = assetFor("p1", blobId);
    await repos.assets.save(asset);
    expect(await repos.assets.getByProject("p1")).toEqual([asset]);
    expect(await repos.assets.getById(asset.id)).toEqual(asset);

    await repos.assets.delete(asset.id);
    expect(await repos.assets.getById(asset.id)).toBeNull();
    expect(await repos.blobs.get(blobId)).toBeNull();
  });
});

describe("toStorageError", () => {
  it("traduce errores de cuota y de disponibilidad", () => {
    expect(toStorageError(new DOMException("full", "QuotaExceededError")).code).toBe("quota");
    // Dexie envuelve el error nativo en `inner`.
    expect(toStorageError({ name: "AbortError", inner: { name: "QuotaExceededError" } }).code).toBe("quota");
    expect(toStorageError({ name: "MissingAPIError" }).code).toBe("unavailable");
    expect(toStorageError(new Error("x")).code).toBe("unknown");
    const original = new StorageError("quota", "m");
    expect(toStorageError(original)).toBe(original);
  });
});
