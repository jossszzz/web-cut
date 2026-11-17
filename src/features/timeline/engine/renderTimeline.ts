import { getProjectDuration } from "@/core/project/queries";
import type { Project } from "@/core/project/schema";
import {
  getClipRect,
  getRulerTickSteps,
  timeToX,
  trackTop,
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
  playhead: number;
  viewport: TimelineViewport;
  layout: TimelineLayout;
  width: number;
  height: number;
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
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeStyle = selected ? COLORS.selection : colors.stroke;
      ctx.stroke();

      if (track.locked) drawHatch(ctx, inset.x, inset.y, inset.w, inset.h);

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
      const subtitle = clip.type === "text" ? (clip.text?.content ?? "") : colors.label;
      ctx.fillText(subtitle, Math.max(inset.x + 8, 8), inset.y + 23);
      ctx.restore();
      ctx.globalAlpha = 1;
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

/** Dibuja el timeline completo. Función pura respecto al estado recibido. */
export function renderTimeline(ctx: CanvasRenderingContext2D, state: TimelineRenderState): void {
  ctx.clearRect(0, 0, state.width, state.height);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, state.width, state.height);
  drawTracks(ctx, state);
  drawRuler(ctx, state);
  drawPlayhead(ctx, state);
}
