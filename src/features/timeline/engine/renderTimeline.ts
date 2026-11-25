import { keyframeTimes } from "@/core/animation/keyframes";
import { getCut } from "@/core/playback/composition";
import { getProjectDuration } from "@/core/project/queries";
import type { Clip, MediaAsset, Project } from "@/core/project/schema";
import {
  getClipRect,
  getRulerTickSteps,
  timeToX,
  trackTop,
  type Rect,
  type TimelineLayout,
  type TimelineViewport,
} from "@/core/timeline/geometry";
import { secondsToUs } from "@/core/types/time";
import { monoFont, roundRectPath, sansFont } from "@/lib/canvas";
import { CLIP_COLORS } from "@/lib/constants/clipColors";

export interface TimelineRenderState {
  project: Project;
  selectedTrackId: string | null;
  selectedClipIds: ReadonlySet<string>;
  assets: Readonly<Record<string, MediaAsset>>;
  /** Miniatura pequeña del asset para las teselas del clip. */
  getThumbnail: (asset: MediaAsset) => CanvasImageSource | null;
  playhead: number;
  viewport: TimelineViewport;
  layout: TimelineLayout;
  width: number;
  height: number;
  /** Instante al que se ha imantado la edición en curso (guía vertical). */
  snapTime?: number | null;
  /** Rectángulo de selección por arrastre. */
  marquee?: Rect | null;
}

const COLORS = {
  background: "#141416",
  ruler: "#1c1c20",
  rulerText: "#8b8b94",
  tickMajor: "rgba(255,255,255,0.28)",
  tickMinor: "rgba(255,255,255,0.12)",
  row: "rgba(255,255,255,0.035)",
  rowSelected: "rgba(103,232,249,0.08)",
  gridLine: "rgba(255,255,255,0.04)",
  projectEnd: "rgba(255,255,255,0.18)",
  playhead: "#67e8f9",
  selection: "#ffffff",
  snap: "#facc15",
  marqueeFill: "rgba(103,232,249,0.12)",
  marqueeStroke: "rgba(103,232,249,0.8)",
};

function formatRulerLabel(seconds: number, step: number): string {
  if (step < 1) return `${Number(seconds.toFixed(2))}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function drawRuler(ctx: CanvasRenderingContext2D, state: TimelineRenderState): void {
  const { viewport, layout, width } = state;
  ctx.fillStyle = COLORS.ruler;
  ctx.fillRect(0, 0, width, layout.rulerHeight);

  const { major, minor } = getRulerTickSteps(viewport.pxPerSecond);
  const firstSecond = viewport.scrollX / viewport.pxPerSecond;
  const lastSecond = (viewport.scrollX + width) / viewport.pxPerSecond;
  const firstMinor = Math.floor(firstSecond / minor);
  const lastMinor = Math.ceil(lastSecond / minor);

  ctx.font = `10px ${monoFont()}`;
  ctx.textBaseline = "top";
  for (let i = firstMinor; i <= lastMinor; i++) {
    const seconds = i * minor;
    const x = Math.round(timeToX(secondsToUs(seconds), viewport)) + 0.5;
    const isMajor = Math.abs(seconds / major - Math.round(seconds / major)) < 1e-6;
    ctx.strokeStyle = isMajor ? COLORS.tickMajor : COLORS.tickMinor;
    ctx.beginPath();
    ctx.moveTo(x, layout.rulerHeight - (isMajor ? 12 : 6));
    ctx.lineTo(x, layout.rulerHeight);
    ctx.stroke();
    if (isMajor) {
      ctx.fillStyle = COLORS.rulerText;
      ctx.fillText(formatRulerLabel(seconds, major), x + 4, 5);
      ctx.strokeStyle = COLORS.gridLine;
      ctx.beginPath();
      ctx.moveTo(x, layout.rulerHeight);
      ctx.lineTo(x, state.height);
      ctx.stroke();
    }
  }
}

function drawHatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  for (let i = -h; i < w; i += 8) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Miniaturas repetidas a lo largo del clip (tira de fotogramas). */
function drawThumbnails(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  state: TimelineRenderState,
  box: { x: number; y: number; w: number; h: number },
): void {
  const asset = clip.assetId ? state.assets[clip.assetId] : undefined;
  if (!asset || asset.kind === "audio") return;
  const source = state.getThumbnail(asset);
  if (!source || !asset.width || !asset.height) return;
  const tileW = Math.max(16, (box.h * asset.width) / asset.height);
  ctx.save();
  roundRectPath(ctx, box.x, box.y, box.w, box.h, 6);
  ctx.clip();
  // Saltar las teselas que quedan a la izquierda del área visible.
  const first = box.x + Math.max(0, Math.floor(-box.x / tileW)) * tileW;
  const last = Math.min(box.x + box.w, state.width);
  for (let x = first; x < last; x += tileW) ctx.drawImage(source, x, box.y, tileW, box.h);
  // Degradado para que el nombre siga siendo legible.
  const gradient = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
  gradient.addColorStop(0, "rgba(0,0,0,0.65)");
  gradient.addColorStop(0.6, "rgba(0,0,0,0.1)");
  ctx.fillStyle = gradient;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.restore();
}

function drawTracks(ctx: CanvasRenderingContext2D, state: TimelineRenderState): void {
  const { project, viewport, layout, width, selectedTrackId, selectedClipIds } = state;

  project.tracks.forEach((track, trackIndex) => {
    const y = trackTop(trackIndex, layout);
    ctx.fillStyle = track.id === selectedTrackId ? COLORS.rowSelected : COLORS.row;
    ctx.fillRect(0, y, width, layout.trackHeight);

    for (const clip of track.clips) {
      const rect = getClipRect(clip, trackIndex, viewport, layout);
      if (rect.x > width || rect.x + rect.width < 0) continue;

      const colors = CLIP_COLORS[clip.type];
      const selected = selectedClipIds.has(clip.id);
      const dimmed = !track.visible || track.muted;
      const inset = { x: rect.x + 1, y: rect.y + 3, w: rect.width - 2, h: rect.height - 6 };

      ctx.globalAlpha = dimmed ? 0.4 : 1;
      roundRectPath(ctx, inset.x, inset.y, inset.w, inset.h, 6);
      ctx.fillStyle = colors.fill;
      ctx.fill();
      drawThumbnails(ctx, clip, state, inset);
      roundRectPath(ctx, inset.x, inset.y, inset.w, inset.h, 6);
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeStyle = selected ? COLORS.selection : colors.stroke;
      ctx.stroke();

      if (track.locked) drawHatch(ctx, inset.x, inset.y, inset.w, inset.h);

      // Keyframes del clip seleccionado.
      if (selected) {
        ctx.fillStyle = "#fcd34d";
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        for (const time of keyframeTimes(clip)) {
          if (time < 0 || time > clip.duration) continue;
          const kx = rect.x + (time / clip.duration) * rect.width;
          const ky = inset.y + inset.h - 7;
          ctx.beginPath();
          ctx.moveTo(kx, ky - 4);
          ctx.lineTo(kx + 4, ky);
          ctx.lineTo(kx, ky + 4);
          ctx.lineTo(kx - 4, ky);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      // Asas de recorte en clips seleccionados y editables.
      if (selected && !track.locked && inset.w >= 18) {
        ctx.fillStyle = COLORS.selection;
        const handleH = inset.h - 16;
        roundRectPath(ctx, inset.x + 2, inset.y + 8, 3, handleH, 1.5);
        ctx.fill();
        roundRectPath(ctx, inset.x + inset.w - 5, inset.y + 8, 3, handleH, 1.5);
        ctx.fill();
      }

      // Etiqueta recortada al clip.
      ctx.save();
      ctx.beginPath();
      ctx.rect(inset.x + 6, inset.y, Math.max(0, inset.w - 12), inset.h);
      ctx.clip();
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "top";
      ctx.font = `500 12px ${sansFont()}`;
      ctx.fillText(clip.name, Math.max(inset.x + 8, 8), inset.y + 6);
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.font = `10px ${sansFont()}`;
      const missing = clip.assetId !== undefined && !state.assets[clip.assetId];
      const subtitle =
        clip.type === "text" ? (clip.text?.content ?? "") : missing ? "Medio no disponible" : colors.label;
      ctx.fillText(subtitle, Math.max(inset.x + 8, 8), inset.y + 23);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Marcadores de transición en los cortes.
    for (const clip of track.clips) {
      const cut = getCut(track, clip);
      if (!cut) continue;
      const x0 = timeToX(cut.start, viewport);
      const x1 = timeToX(cut.end, viewport);
      if (x1 < 0 || x0 > width) continue;
      const midY = y + layout.trackHeight / 2;
      const half = Math.min(10, layout.trackHeight / 2 - 6);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x0, y + 3, x1 - x0, layout.trackHeight - 6);
      const cx = timeToX(clip.start, viewport);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath(); // "pajarita": dos triángulos enfrentados
      ctx.moveTo(cx - half, midY - half);
      ctx.lineTo(cx, midY);
      ctx.lineTo(cx - half, midY + half);
      ctx.closePath();
      ctx.moveTo(cx + half, midY - half);
      ctx.lineTo(cx, midY);
      ctx.lineTo(cx + half, midY + half);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  });
}

function drawPlayhead(ctx: CanvasRenderingContext2D, state: TimelineRenderState): void {
  const { viewport, layout, height, project } = state;

  const endX = Math.round(timeToX(getProjectDuration(project), viewport)) + 0.5;
  if (endX > 0) {
    ctx.strokeStyle = COLORS.projectEnd;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(endX, layout.rulerHeight);
    ctx.lineTo(endX, height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const x = Math.round(timeToX(state.playhead, viewport)) + 0.5;
  if (x < -6 || x > state.width + 6) return;
  ctx.strokeStyle = COLORS.playhead;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
  ctx.fillStyle = COLORS.playhead;
  ctx.beginPath();
  ctx.moveTo(x - 6, 0);
  ctx.lineTo(x + 6, 0);
  ctx.lineTo(x + 6, 10);
  ctx.lineTo(x, 16);
  ctx.lineTo(x - 6, 10);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1;
}

function drawOverlays(ctx: CanvasRenderingContext2D, state: TimelineRenderState): void {
  if (state.snapTime !== null && state.snapTime !== undefined) {
    const x = Math.round(timeToX(state.snapTime, state.viewport)) + 0.5;
    ctx.strokeStyle = COLORS.snap;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, state.layout.rulerHeight);
    ctx.lineTo(x, state.height);
    ctx.stroke();
  }
  if (state.marquee) {
    const { x, y, width, height } = state.marquee;
    ctx.fillStyle = COLORS.marqueeFill;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = COLORS.marqueeStroke;
    ctx.strokeRect(x + 0.5, y + 0.5, width, height);
  }
}

/** Dibuja el timeline completo. Función pura respecto al estado recibido. */
export function renderTimeline(ctx: CanvasRenderingContext2D, state: TimelineRenderState): void {
  ctx.clearRect(0, 0, state.width, state.height);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, state.width, state.height);
  drawTracks(ctx, state);
  drawRuler(ctx, state);
  drawOverlays(ctx, state);
  drawPlayhead(ctx, state);
}
