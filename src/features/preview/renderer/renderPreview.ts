import { getVisualClipsAt } from "@/core/project/queries";
import type { Clip, Project } from "@/core/project/schema";
import type { Microseconds } from "@/core/types/time";
import { sansFont } from "@/lib/canvas";
import { CLIP_COLORS } from "@/lib/constants/clipColors";

/**
 * Renderizador de preview del Sprint 1.
 *
 * Todavía no hay decodificación de medios: los clips de video e imagen se
 * dibujan como marcadores de posición con su transformación real (posición,
 * escala, rotación y opacidad). El texto sí se renderiza tal cual.
 */

export interface PreviewRenderState {
  project: Project;
  time: Microseconds;
  selectedClipIds: ReadonlySet<string>;
  /** Tamaño CSS del canvas. */
  width: number;
  height: number;
}

/** Caja del contenido de un clip en píxeles del proyecto, centrada en el origen. */
function measureClip(ctx: CanvasRenderingContext2D, clip: Clip, project: Project): { w: number; h: number } {
  if (clip.type === "text" && clip.text) {
    ctx.font = `600 ${clip.text.fontSize}px ${sansFont()}`;
    const lines = clip.text.content.split("\n");
    const w = Math.max(...lines.map((line) => ctx.measureText(line).width), clip.text.fontSize * 0.5);
    return { w, h: lines.length * clip.text.fontSize * 1.2 };
  }
  return { w: project.settings.width, h: project.settings.height };
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, clip: Clip, w: number, h: number): void {
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
  ctx.fillText(`${colors.label} de prueba · sin medio`, 0, base * 0.07);
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
    const { w, h } = measureClip(ctx, clip, project);

    ctx.save();
    ctx.translate(width / 2 + x * scale, height / 2 + y * scale);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale * scaleX, scale * scaleY);
    ctx.globalAlpha = opacity;
    if (clip.type === "text") drawText(ctx, clip);
    else drawPlaceholder(ctx, clip, w, h);
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
