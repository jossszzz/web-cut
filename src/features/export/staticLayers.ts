import type { Clip, MediaAsset, Project } from "@/core/project/schema";
import { measureMedia } from "@/features/render/compositor";
import { drawPlaceholder, drawText, measureText, placeholderSubtitle, textShadowPadding } from "@/features/render/drawing";
import { sansFont } from "@/lib/canvas";

import type { StaticLayer } from "./types";

/**
 * Prerenderiza en el hilo principal lo que no cambia con el tiempo: los
 * textos (con la tipografía de la app, que el worker no tiene) y los
 * marcadores de clips sin medio. El worker solo los compone.
 */

const MAX_BITMAP_SIDE = 4096;

/** Mayor escala que alcanza el clip (estática o por keyframes). */
function maxScale(clip: Clip): number {
  const values = [clip.transform.scaleX, clip.transform.scaleY, ...(clip.keyframes.scaleX ?? []).map((k) => k.value), ...(clip.keyframes.scaleY ?? []).map((k) => k.value)];
  return Math.max(...values.map(Math.abs), 0.01);
}

function needsPlaceholder(clip: Clip, assets: Readonly<Record<string, MediaAsset>>): boolean {
  if (clip.type === "text" || clip.type === "audio") return false;
  return !clip.assetId || !assets[clip.assetId];
}

function toBitmap(width: number, height: number, draw: (ctx: OffscreenCanvasRenderingContext2D) => void): ImageBitmap | null {
  const canvas = new OffscreenCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  draw(ctx);
  return canvas.transferToImageBitmap();
}

export async function renderStaticLayers(
  project: Project,
  assets: Readonly<Record<string, MediaAsset>>,
  outputWidth: number,
): Promise<StaticLayer[]> {
  if (typeof document !== "undefined") await document.fonts?.ready;
  const font = sansFont();
  const outputScale = outputWidth / project.settings.width;
  const measureCtx = new OffscreenCanvas(1, 1).getContext("2d");
  if (!measureCtx) return [];
  const layers: StaticLayer[] = [];

  for (const track of project.tracks) {
    if (track.type === "audio" || !track.visible) continue;
    for (const clip of track.clips) {
      if (clip.type === "text" && clip.text) {
        const { w, h } = measureText(measureCtx, clip, font);
        const pad = textShadowPadding(clip);
        const fullW = w + pad * 2;
        const fullH = h + pad * 2;
        const scale = Math.min(outputScale * maxScale(clip), MAX_BITMAP_SIDE / Math.max(fullW, fullH));
        const bitmap = toBitmap(fullW * scale, fullH * scale, (ctx) => {
          ctx.translate((fullW * scale) / 2, (fullH * scale) / 2);
          ctx.scale(scale, scale);
          drawText(ctx, clip, font);
        });
        if (bitmap) layers.push({ clipId: clip.id, bitmap, width: w, height: h, pad });
      } else if (needsPlaceholder(clip, assets)) {
        const { w, h } = measureMedia(project, undefined);
        const scale = Math.min(outputScale, MAX_BITMAP_SIDE / Math.max(w, h));
        const bitmap = toBitmap(w * scale, h * scale, (ctx) => {
          ctx.translate((w * scale) / 2, (h * scale) / 2);
          ctx.scale(scale, scale);
          drawPlaceholder(ctx, clip, w, h, placeholderSubtitle(clip, Boolean(clip.assetId)), font);
        });
        if (bitmap) layers.push({ clipId: clip.id, bitmap, width: w, height: h, pad: 0 });
      }
    }
  }
  return layers;
}
