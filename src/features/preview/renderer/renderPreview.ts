import type { Clip, MediaAsset, Project } from "@/core/project/schema";
import type { Microseconds } from "@/core/types/time";
import { composeFrame, drawCroppedImage, measureMedia, type LayerRenderer } from "@/features/render/compositor";
import { drawBadge, drawPlaceholder, drawText, measureText, placeholderSubtitle } from "@/features/render/drawing";
import { sansFont } from "@/lib/canvas";

import { boxCorners, HANDLE_SIZE, rotateHandlePosition, type PreviewBox } from "./previewGeometry";

/**
 * Renderizador de preview sobre el compositor compartido con la exportación.
 *
 * - Imágenes y texto se dibujan tal cual.
 * - Videos: el frame actual del elemento `<video>` que gestiona el motor de
 *   reproducción; mientras carga, su miniatura.
 * - Clips sin medio (demostración) o con el medio eliminado: marcador de posición.
 */

export interface ClipImage {
  image: CanvasImageSource;
  /** Aviso superpuesto (p. ej. formato no reproducible). */
  note?: string;
}

export interface PreviewRenderState {
  project: Project;
  time: Microseconds;
  selectedClipIds: ReadonlySet<string>;
  assets: Readonly<Record<string, MediaAsset>>;
  /** Imagen a dibujar para un clip con medio (con un aviso opcional), o `null` si aún no está lista. */
  getClipImage: (clip: Clip, asset: MediaAsset) => ClipImage | null;
  /** Tamaño CSS del canvas. */
  width: number;
  height: number;
}

const TEXT_PADDING = 16;
const SELECTION_COLOR = "#67e8f9";

function previewRenderer(ctx: CanvasRenderingContext2D, state: PreviewRenderState): LayerRenderer {
  const font = sansFont();
  return {
    measure: (clip) => {
      if (clip.type === "text") return measureText(ctx, clip, font);
      return measureMedia(state.project, clip.assetId ? state.assets[clip.assetId] : undefined);
    },
    draw: (c, clip, w, h) => {
      if (clip.type === "text") return drawText(c, clip, font);
      const asset = clip.assetId ? state.assets[clip.assetId] : undefined;
      if (!asset) return drawPlaceholder(c, clip, w, h, placeholderSubtitle(clip, Boolean(clip.assetId)), font);
      const source = state.getClipImage(clip, asset);
      if (!source) {
        c.fillStyle = "#0b0b0d";
        c.fillRect(-w / 2, -h / 2, w, h);
        return;
      }
      drawCroppedImage(c, source.image, clip.crop, w, h);
      if (source.note) drawBadge(c, source.note, w, h, font);
    },
  };
}

function drawSelection(ctx: CanvasRenderingContext2D, base: DOMMatrix, box: PreviewBox): void {
  ctx.save();
  ctx.setTransform(base);
  const corners = boxCorners(box);
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.closePath();
  ctx.stroke();
  if (box.editable) {
    const rotate = rotateHandlePosition(box);
    const top = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(rotate.x, rotate.y);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    for (const c of corners) {
      ctx.fillRect(c.x - HANDLE_SIZE / 2, c.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      ctx.strokeRect(c.x - HANDLE_SIZE / 2, c.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    }
    ctx.beginPath();
    ctx.arc(rotate.x, rotate.y, HANDLE_SIZE / 2 + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Dibuja la composición en `state.time` y devuelve las cajas de los clips
 * pintados (en píxeles CSS), para la interacción con el ratón.
 */
export function renderPreview(ctx: CanvasRenderingContext2D, state: PreviewRenderState): PreviewBox[] {
  const { project, width, height } = state;
  // Transformación base (devicePixelRatio × calidad) fijada por prepareCanvas.
  const base = ctx.getTransform();
  const toCss = base.inverse();

  const layers = composeFrame(ctx, project, state.time, width, height, previewRenderer(ctx, state));
  const boxes: PreviewBox[] = layers.map(({ clip, track, matrix, width: w, height: h }) => {
    const pad = clip.type === "text" ? TEXT_PADDING : 0;
    return { clipId: clip.id, matrix: toCss.multiply(matrix), width: w + pad * 2, height: h + pad * 2, editable: !track.locked };
  });

  // Controles de selección encima de todo (pueden salir del encuadre).
  for (const box of boxes) {
    if (state.selectedClipIds.has(box.clipId)) drawSelection(ctx, base, box);
  }
  return boxes;
}
