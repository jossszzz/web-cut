import { evaluateTransform } from "@/core/animation/keyframes";
import { getVisualLayersAt, type TransitionState, type VisualLayer } from "@/core/playback/composition";
import type { Clip, Crop, MediaAsset, Project } from "@/core/project/schema";
import type { Microseconds } from "@/core/types/time";

/**
 * Compositor compartido por la preview (hilo principal) y la exportación
 * (worker). No usa el DOM: recibe un contexto 2D (de canvas u OffscreenCanvas)
 * y un `LayerRenderer` que sabe medir y pintar el contenido de cada clip.
 *
 * Así la imagen exportada sale del mismo código que la preview: mismas capas,
 * transformaciones (con keyframes), recortes y transiciones.
 */

export type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface LayerRenderer {
  /** Tamaño completo (sin recorte) del contenido en píxeles del proyecto. */
  measure(clip: Clip): { w: number; h: number };
  /** Pinta el contenido centrado en el origen, con tamaño `w × h` (ya recortado). */
  draw(ctx: Context2D, clip: Clip, w: number, h: number): void;
}

export interface ComposedLayer extends VisualLayer {
  /** Transformación del contexto al pintar la capa (incluye la base del canvas). */
  matrix: DOMMatrix;
  /** Tamaño pintado (recortado) en píxeles del proyecto. */
  width: number;
  height: number;
}

/** Fracción visible tras el recorte. */
export function cropFactor(crop: Crop) {
  return {
    fx: Math.max(0.05, 1 - crop.left - crop.right),
    fy: Math.max(0.05, 1 - crop.top - crop.bottom),
  };
}

/** Rectángulo de la fuente que queda tras el recorte. */
export function cropRect(crop: Crop, width: number, height: number) {
  const { fx, fy } = cropFactor(crop);
  return { sx: crop.left * width, sy: crop.top * height, sw: fx * width, sh: fy * height };
}

/** Tamaño de un medio ajustado ("contain") al lienzo, como al importar en CapCut. */
export function measureMedia(project: Project, asset: MediaAsset | undefined): { w: number; h: number } {
  const { width: W, height: H } = project.settings;
  if (asset?.width && asset.height) {
    const fit = Math.min(W / asset.width, H / asset.height);
    return { w: asset.width * fit, h: asset.height * fit };
  }
  return { w: W, h: H };
}

/** Tamaño intrínseco de cualquier fuente de imagen de canvas. */
export function intrinsicSize(image: CanvasImageSource): { w: number; h: number } {
  if ("videoWidth" in image && typeof image.videoWidth === "number") return { w: image.videoWidth, h: image.videoHeight };
  if ("displayWidth" in image && typeof image.displayWidth === "number") {
    return { w: image.displayWidth, h: image.displayHeight };
  }
  const sized = image as { width: number | SVGAnimatedLength; height: number | SVGAnimatedLength };
  const w = typeof sized.width === "number" ? sized.width : sized.width.baseVal.value;
  const h = typeof sized.height === "number" ? sized.height : sized.height.baseVal.value;
  return { w, h };
}

/** Pinta una imagen con el recorte del clip, centrada en el origen. */
export function drawCroppedImage(ctx: Context2D, image: CanvasImageSource, crop: Crop, w: number, h: number): void {
  const { w: iw, h: ih } = intrinsicSize(image);
  if (iw <= 0 || ih <= 0) return;
  const { sx, sy, sw, sh } = cropRect(crop, iw, ih);
  ctx.drawImage(image, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
}

/** Opacidad, desplazamiento y máscara que aplica una transición a una capa. */
export function transitionEffect(transition: TransitionState | undefined, width: number) {
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

/**
 * Pinta la composición en `time` sobre un área de `width × height` (en las
 * unidades actuales del contexto) y devuelve las capas pintadas.
 */
export function composeFrame(
  ctx: Context2D,
  project: Project,
  time: Microseconds,
  width: number,
  height: number,
  renderer: LayerRenderer,
  layers: VisualLayer[] = getVisualLayersAt(project, time),
): ComposedLayer[] {
  const scale = width / project.settings.width;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = project.settings.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Recortar al lienzo: lo que sale del encuadre no se ve ni se exporta.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  const composed: ComposedLayer[] = [];
  for (const layer of layers) {
    const { clip, localTime, transition } = layer;
    const { x, y, scaleX, scaleY, rotation, opacity } = evaluateTransform(clip, localTime);
    const full = renderer.measure(clip);
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
    renderer.draw(ctx, clip, w, h);
    const matrix = ctx.getTransform();
    ctx.restore();

    composed.push({ ...layer, matrix, width: w, height: h });
  }
  ctx.restore();
  return composed;
}
