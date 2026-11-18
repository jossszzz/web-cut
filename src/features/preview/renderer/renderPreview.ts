import { getVisualClipsAt } from "@/core/project/queries";
import type { Clip, MediaAsset, Project } from "@/core/project/schema";
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
 * Todo con la transformación real del clip (posición, escala, rotación, opacidad).
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
  ctx.drawImage(source.image, -w / 2, -h / 2, w, h);
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

export function renderPreview(ctx: CanvasRenderingContext2D, state: PreviewRenderState): void {
  const { project, width, height } = state;
  const scale = width / project.settings.width;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = project.settings.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Recortar al lienzo: lo que sale del encuadre no se exporta.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  const selectionBoxes: Array<() => void> = [];

  for (const { clip } of getVisualClipsAt(project, state.time)) {
    const { x, y, scaleX, scaleY, rotation, opacity } = clip.transform;
    const asset = clip.assetId ? state.assets[clip.assetId] : undefined;
    const { w, h } = measureClip(ctx, clip, project, asset);

    ctx.save();
    ctx.translate(width / 2 + x * scale, height / 2 + y * scale);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale * scaleX, scale * scaleY);
    ctx.globalAlpha = opacity;
    if (clip.type === "text") drawText(ctx, clip);
    else drawMediaClip(ctx, clip, w, h, state);
    const matrix = ctx.getTransform();
    ctx.restore();

    if (state.selectedClipIds.has(clip.id)) {
      selectionBoxes.push(() => {
        ctx.save();
        ctx.setTransform(matrix);
        const pad = clip.type === "text" ? 16 : 0;
        ctx.strokeStyle = "#67e8f9";
        ctx.lineWidth = 2 / (scale * Math.max(scaleX, scaleY));
        ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2);
        ctx.restore();
      });
    }
  }
  ctx.restore();

  // Cajas de selección encima de todo (pueden salir del encuadre).
  for (const draw of selectionBoxes) draw();
}
