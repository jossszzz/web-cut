"use client";

import { useSyncExternalStore } from "react";

import type { MediaAsset } from "@/core/project/schema";
import { getRepositories } from "@/infrastructure";
import { LruBudget } from "@/lib/cache/lruBudget";

/**
 * Cachés de imágenes decodificadas (ImageBitmap) para los canvas. Viven fuera
 * de Zustand porque son recursos nativos que hay que liberar.
 *
 * - **Fuentes de la preview** (`getFrameSource`): la imagen original (limitada
 *   a 4K) o, para videos, su miniatura como fotograma de espera. Con un
 *   presupuesto de memoria: si se supera, se liberan las menos usadas y se
 *   vuelven a cargar cuando se necesiten.
 * - **Miniaturas del timeline** (`getThumbnailSource`): bitmaps pequeños
 *   (alto fijo) para pintar las teselas de los clips sin escalar imágenes
 *   grandes en cada redibujado.
 */

type Entry = { status: "loading" } | { status: "ready"; bitmap: ImageBitmap } | { status: "error" };

const MAX_IMAGE_SIDE = 3840;
/** Presupuesto de píxeles de la preview (≈ 48 MP ≈ 190 MB en RGBA). */
export const FRAME_SOURCE_BUDGET = 48_000_000;
/** Alto de las miniaturas del timeline (2× la pista para pantallas HiDPI). */
export const TIMELINE_THUMBNAIL_HEIGHT = 96;

const frames = new Map<string, Entry>();
const thumbnails = new Map<string, Entry>();
const budget = new LruBudget<string>(FRAME_SOURCE_BUDGET);
const listeners = new Set<() => void>();
let version = 0;
let generation = 0;

function notify(): void {
  version++;
  listeners.forEach((listener) => listener());
}

function closeEntry(entry: Entry | undefined): void {
  if (entry?.status === "ready") entry.bitmap.close();
}

function frameBlobId(asset: MediaAsset): string | undefined {
  if (asset.kind === "image") return asset.blobId;
  if (asset.kind === "video") return asset.thumbnailBlobId;
  return undefined;
}

async function decode(blobId: string, options?: ImageBitmapOptions): Promise<ImageBitmap> {
  const blob = await getRepositories().blobs.get(blobId);
  if (!blob) throw new Error("Blob no encontrado");
  return options ? createImageBitmap(blob, options) : createImageBitmap(blob);
}

async function loadFrame(asset: MediaAsset, blobId: string, gen: number): Promise<void> {
  try {
    const large = asset.width && asset.height && Math.max(asset.width, asset.height) > MAX_IMAGE_SIDE;
    const bitmap = await decode(
      blobId,
      large
        ? {
            resizeWidth: Math.round((asset.width! / Math.max(asset.width!, asset.height!)) * MAX_IMAGE_SIDE),
            resizeQuality: "high",
          }
        : undefined,
    );
    if (gen !== generation || frames.get(asset.id)?.status !== "loading") {
      bitmap.close();
      return;
    }
    frames.set(asset.id, { status: "ready", bitmap });
    for (const id of budget.add(asset.id, bitmap.width * bitmap.height)) {
      closeEntry(frames.get(id));
      frames.delete(id);
    }
  } catch (error) {
    if (gen !== generation) return;
    console.warn("[WebCut] No se pudo cargar la imagen del asset", asset.id, error);
    frames.set(asset.id, { status: "error" });
  }
  notify();
}

async function loadThumbnail(asset: MediaAsset, blobId: string, gen: number): Promise<void> {
  try {
    const bitmap = await decode(blobId, { resizeHeight: TIMELINE_THUMBNAIL_HEIGHT, resizeQuality: "medium" });
    if (gen !== generation || thumbnails.get(asset.id)?.status !== "loading") {
      bitmap.close();
      return;
    }
    thumbnails.set(asset.id, { status: "ready", bitmap });
  } catch {
    if (gen !== generation) return;
    thumbnails.set(asset.id, { status: "error" });
  }
  notify();
}

/** Bitmap para la preview si ya está listo; si no, inicia la carga y devuelve `null`. */
export function getFrameSource(asset: MediaAsset): ImageBitmap | null {
  const entry = frames.get(asset.id);
  if (entry) {
    if (entry.status !== "ready") return null;
    budget.touch(asset.id);
    return entry.bitmap;
  }
  const blobId = frameBlobId(asset);
  if (!blobId || typeof createImageBitmap === "undefined") return null;
  frames.set(asset.id, { status: "loading" });
  void loadFrame(asset, blobId, generation);
  return null;
}

/** Miniatura pequeña para el timeline (o `null` mientras carga). */
export function getThumbnailSource(asset: MediaAsset): ImageBitmap | null {
  const entry = thumbnails.get(asset.id);
  if (entry) return entry.status === "ready" ? entry.bitmap : null;
  const blobId = asset.thumbnailBlobId ?? (asset.kind === "image" ? asset.blobId : undefined);
  if (!blobId || typeof createImageBitmap === "undefined") return null;
  thumbnails.set(asset.id, { status: "loading" });
  void loadThumbnail(asset, blobId, generation);
  return null;
}

/** Libera bitmaps. Sin argumento, libera todos (al cambiar de proyecto o salir del editor). */
export function releaseFrameSources(assetIds?: Iterable<string>): void {
  const ids = assetIds ? [...assetIds] : [...new Set([...frames.keys(), ...thumbnails.keys()])];
  for (const id of ids) {
    closeEntry(frames.get(id));
    closeEntry(thumbnails.get(id));
    frames.delete(id);
    thumbnails.delete(id);
    budget.remove(id);
  }
  if (!assetIds) generation++;
  notify();
}

/** Estadísticas para las pruebas de memoria. */
export function frameSourceStats() {
  const ready = (map: Map<string, Entry>) => [...map.values()].filter((e) => e.status === "ready").length;
  return { frames: ready(frames), thumbnails: ready(thumbnails), pixels: budget.used };
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
