"use client";

import { useSyncExternalStore } from "react";

import type { MediaAsset } from "@/core/project/schema";
import { getRepositories } from "@/infrastructure";

/**
 * Caché de imágenes decodificadas (ImageBitmap) para dibujar en los canvas.
 * Vive fuera de Zustand porque son recursos nativos que hay que liberar.
 *
 * - Imágenes: el archivo original (reducido a 4K como máximo).
 * - Videos: la miniatura como fotograma de referencia, hasta tener
 *   decodificación real en la Fase 4.
 */

type Entry = { status: "loading" } | { status: "ready"; bitmap: ImageBitmap } | { status: "error" };

const MAX_IMAGE_SIDE = 3840;
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;
let generation = 0;

function notify(): void {
  version++;
  listeners.forEach((listener) => listener());
}

function sourceBlobId(asset: MediaAsset): string | undefined {
  if (asset.kind === "image") return asset.blobId;
  if (asset.kind === "video") return asset.thumbnailBlobId;
  return undefined;
}

async function load(asset: MediaAsset, blobId: string, gen: number): Promise<void> {
  try {
    const blob = await getRepositories().blobs.get(blobId);
    if (!blob) throw new Error("Blob no encontrado");
    const large = asset.width && asset.height && Math.max(asset.width, asset.height) > MAX_IMAGE_SIDE;
    const bitmap = large
      ? await createImageBitmap(blob, {
          resizeWidth: Math.round((asset.width! / Math.max(asset.width!, asset.height!)) * MAX_IMAGE_SIDE),
          resizeQuality: "high",
        })
      : await createImageBitmap(blob);
    if (gen !== generation) {
      bitmap.close();
      return;
    }
    cache.set(asset.id, { status: "ready", bitmap });
  } catch (error) {
    if (gen !== generation) return;
    console.warn("[WebCut] No se pudo cargar la imagen del asset", asset.id, error);
    cache.set(asset.id, { status: "error" });
  }
  notify();
}

/** Devuelve el bitmap si ya está listo; si no, inicia la carga y devuelve `null`. */
export function getFrameSource(asset: MediaAsset): ImageBitmap | null {
  const entry = cache.get(asset.id);
  if (entry) return entry.status === "ready" ? entry.bitmap : null;
  const blobId = sourceBlobId(asset);
  if (!blobId || typeof createImageBitmap === "undefined") return null;
  cache.set(asset.id, { status: "loading" });
  void load(asset, blobId, generation);
  return null;
}

/** Libera bitmaps. Sin argumento, libera todos (al cambiar de proyecto). */
export function releaseFrameSources(assetIds?: Iterable<string>): void {
  const ids = assetIds ? [...assetIds] : [...cache.keys()];
  for (const id of ids) {
    const entry = cache.get(id);
    if (entry?.status === "ready") entry.bitmap.close();
    cache.delete(id);
  }
  if (!assetIds) generation++;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Versión que cambia cuando hay bitmaps nuevos; úsala como dependencia para redibujar. */
export function useFrameSourcesVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}
