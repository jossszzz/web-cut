import { evaluateTransform } from "@/core/animation/keyframes";
import { getVisualLayersAt, type TransitionState } from "@/core/playback/composition";
import type { Clip, Crop, MediaAsset, Project } from "@/core/project/schema";
import type { Microseconds } from "@/core/types/time";
import { sansFont } from "@/lib/canvas";
import { CLIP_COLORS } from "@/lib/constants/clipColors";

/**
 * Renderizador de preview.
 *
 * - Imágenes y texto se dibujan tal cual.
 * - Videos: el frame actual del elemento `<video>` que gestiona el motor de
 *   reproducción; mientras carga, su miniatura.
 * - Clips sin medio (demostración) o con el medio eliminado: marcador de posición.
 *
 * Todo con la transformación del clip evaluada en el instante (keyframes), su
 * recorte (crop) y, en la ventana de un corte, la transición correspondiente.
 */

import { boxCorners, HANDLE_SIZE, rotateHandlePosition, type PreviewBox } from "./previewGeometry";

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

function intrinsicSize(image: CanvasImageSource): { w: number; h: number } {
  if (typeof HTMLVideoElement !== "undefined" && image instanceof HTMLVideoElement) {
    return { w: image.videoWidth, h: image.videoHeight };
  }
  const sized = image as { width: number | SVGAnimatedLength; height: number | SVGAnimatedLength };
  const w = typeof sized.width === "number" ? sized.width : sized.width.baseVal.value;
  const h = typeof sized.height === "number" ? sized.height : sized.height.baseVal.value;
  return { w, h };
}

/** Fracción visible tras el recorte. */
function cropFactor(crop: Crop) {
  return {
    fx: Math.max(0.05, 1 - crop.left - crop.right),
    fy: Math.max(0.05, 1 - crop.top - crop.bottom),
  };
}

/** Caja del contenido de un clip en píxeles del proyecto, centrada en el origen. */
function measureClip(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  project: Project,
  asset: MediaAsset | undefined,
): { w: number; h: number } {
  if (clip.type === "text" && clip.text) {
    ctx.font = `600 ${clip.text.fontSize}px ${sansFont()}`;
    const lines = clip.text.content.split("\n");
    const w = Math.max(...lines.map((line) => ctx.measureText(line).width), clip.text.fontSize * 0.5);
    return { w, h: lines.length * clip.text.fontSize * 1.2 };
  }
  const { width: W, height: H } = project.settings;
  if (asset?.width && asset.height) {
    // Ajuste "contain" al lienzo, como al importar en CapCut.
    const fit = Math.min(W / asset.width, H / asset.height);
    return { w: asset.width * fit, h: asset.height * fit };
  }
  return { w: W, h: H };
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, clip: Clip, w: number, h: number, subtitle: string): void {
  const colors = CLIP_COLORS[clip.type];
  const gradient = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  gradient.addColorStop(0, colors.fill);
  gradient.addColorStop(1, "#0f172a");
  ctx.fillStyle = gradient;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  ctx.save();
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 24;
  for (let i = -h; i < w; i += 96) {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + i, h / 2);
    ctx.lineTo(-w / 2 + i + h, -h / 2);
    ctx.stroke();
  }
  ctx.restore();

  const base = Math.min(w, h);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${base * 0.09}px ${sansFont()}`;
  ctx.fillText(clip.name, 0, -base * 0.04);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `${base * 0.045}px ${sansFont()}`;
  ctx.fillText(subtitle, 0, base * 0.07);
}

function drawBadge(ctx: CanvasRenderingContext2D, text: string, w: number, h: number): void {
  const size = Math.max(14, Math.min(w, h) * 0.035);
  ctx.font = `500 ${size}px ${sansFont()}`;
  const padding = size * 0.6;
  const textWidth = ctx.measureText(text).width;
  const x = -w / 2 + size;
  const y = h / 2 - size * 2.6;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.roundRect(x, y, textWidth + padding * 2, size * 1.8, size * 0.4);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padding, y + size * 0.9);
}

function drawMediaClip(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  w: number,
  h: number,
  state: PreviewRenderState,
): void {
  if (!clip.assetId) {
    drawPlaceholder(ctx, clip, w, h, `${CLIP_COLORS[clip.type].label} de prueba · sin medio`);
    return;
  }
  const asset = state.assets[clip.assetId];
  if (!asset) {
    drawPlaceholder(ctx, clip, w, h, "Medio no disponible");
    return;
  }
  const source = state.getClipImage(clip, asset);
  if (!source) {
    ctx.fillStyle = "#0b0b0d";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    return;
  }
  const { w: iw, h: ih } = intrinsicSize(source.image);
  const { left, top } = clip.crop;
  const { fx, fy } = cropFactor(clip.crop);
  if (iw > 0 && ih > 0) {
    ctx.drawImage(source.image, left * iw, top * ih, fx * iw, fy * ih, -w / 2, -h / 2, w, h);
  }
  if (source.note) drawBadge(ctx, source.note, w, h);
}

function drawText(ctx: CanvasRenderingContext2D, clip: Clip): void {
  if (!clip.text) return;
  const { content, fontSize, color } = clip.text;
  const lines = content.split("\n");
  ctx.font = `600 ${fontSize}px ${sansFont()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = fontSize * 0.08;
  const lineHeight = fontSize * 1.2;
  lines.forEach((line, i) => {
    ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * lineHeight);
  });
  ctx.shadowBlur = 0;
}

/** Opacidad y desplazamiento que aplica una transición a una capa. */
function transitionEffect(transition: TransitionState | undefined, width: number) {
  if (!transition) return { alpha: 1, offsetX: 0, clipFromX: null as number | null };
  const p = transition.progress;
  const out = transition.role === "out";
  switch (transition.type) {
    case "crossfade":
      return { alpha: out ? 1 : p, offsetX: 0, clipFromX: null };
    case "fade":
      return { alpha: out ? Math.max(0, 1 - 2 * p) : Math.max(0, 2 * p - 1), offsetX: 0, clipFromX: null };
    case "wipe-left":
      return { alpha: 1, offsetX: 0, clipFromX: out ? null : width * (1 - p) };
    case "slide-left":
      return { alpha: 1, offsetX: out ? -p * width : (1 - p) * width, clipFromX: null };
  }
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
  const scale = width / project.settings.width;
  // Transformación base (devicePixelRatio × calidad) fijada por prepareCanvas.
  const base = ctx.getTransform();
  const toCss = base.inverse();

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = project.settings.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Recortar al lienzo: lo que sale del encuadre no se exporta.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  const boxes: PreviewBox[] = [];

  for (const { clip, track, localTime, transition } of getVisualLayersAt(project, state.time)) {
    const { x, y, scaleX, scaleY, rotation, opacity } = evaluateTransform(clip, localTime);
    const asset = clip.assetId ? state.assets[clip.assetId] : undefined;
    const full = measureClip(ctx, clip, project, asset);
    const { fx, fy } = clip.type === "text" ? { fx: 1, fy: 1 } : cropFactor(clip.crop);
    const w = full.w * fx;
    const h = full.h * fy;
    const effect = transitionEffect(transition, width);

    ctx.save();
    if (effect.clipFromX !== null) {
      ctx.beginPath();
      ctx.rect(effect.clipFromX, 0, width - effect.clipFromX, height);
      ctx.clip();
    }
    ctx.translate(width / 2 + x * scale + effect.offsetX, height / 2 + y * scale);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale * scaleX, scale * scaleY);
    ctx.globalAlpha = opacity * effect.alpha;
    if (clip.type === "text") drawText(ctx, clip);
    else drawMediaClip(ctx, clip, w, h, state);
    const matrix = toCss.multiply(ctx.getTransform());
    ctx.restore();

    const pad = clip.type === "text" ? TEXT_PADDING : 0;
    boxes.push({
      clipId: clip.id,
      matrix,
      width: w + pad * 2,
      height: h + pad * 2,
      editable: !track.locked,
    });
  }
  ctx.restore();

  // Controles de selección encima de todo (pueden salir del encuadre).
  for (const box of boxes) {
    if (state.selectedClipIds.has(box.clipId)) drawSelection(ctx, base, box);
  }
  return boxes;
}
