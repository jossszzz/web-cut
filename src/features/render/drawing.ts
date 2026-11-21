import type { Clip } from "@/core/project/schema";
import { CLIP_COLORS } from "@/lib/constants/clipColors";

import type { Context2D } from "./compositor";

/**
 * Dibujo de contenidos que no dependen del tiempo (texto y marcadores de
 * posición). Sin acceso al DOM: la familia tipográfica llega como parámetro.
 */

const LINE_HEIGHT = 1.2;

/** Escala actual del contexto (para que la sombra no dependa de la resolución). */
function contextScale(ctx: Context2D): number {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
}

/** Tamaño del bloque de texto en píxeles del proyecto. */
export function measureText(ctx: Context2D, clip: Clip, fontFamily: string): { w: number; h: number } {
  if (!clip.text) return { w: 0, h: 0 };
  ctx.font = `600 ${clip.text.fontSize}px ${fontFamily}`;
  const lines = clip.text.content.split("\n");
  const w = Math.max(...lines.map((line) => ctx.measureText(line).width), clip.text.fontSize * 0.5);
  return { w, h: lines.length * clip.text.fontSize * LINE_HEIGHT };
}

/** Margen que necesita la sombra del texto alrededor del bloque. */
export function textShadowPadding(clip: Clip): number {
  return clip.text ? Math.ceil(clip.text.fontSize * 0.25) : 0;
}

export function drawText(ctx: Context2D, clip: Clip, fontFamily: string): void {
  if (!clip.text) return;
  const { content, fontSize, color } = clip.text;
  const lines = content.split("\n");
  ctx.font = `600 ${fontSize}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = fontSize * 0.08 * contextScale(ctx);
  const lineHeight = fontSize * LINE_HEIGHT;
  lines.forEach((line, i) => {
    ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * lineHeight);
  });
  ctx.shadowBlur = 0;
}

export function drawPlaceholder(
  ctx: Context2D,
  clip: Clip,
  w: number,
  h: number,
  subtitle: string,
  fontFamily: string,
): void {
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
  ctx.font = `600 ${base * 0.09}px ${fontFamily}`;
  ctx.fillText(clip.name, 0, -base * 0.04);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `${base * 0.045}px ${fontFamily}`;
  ctx.fillText(subtitle, 0, base * 0.07);
}

export function placeholderSubtitle(clip: Clip, assetMissing: boolean): string {
  return assetMissing ? "Medio no disponible" : `${CLIP_COLORS[clip.type].label} de prueba · sin medio`;
}

export function drawBadge(ctx: Context2D, text: string, w: number, h: number, fontFamily: string): void {
  const size = Math.max(14, Math.min(w, h) * 0.035);
  ctx.font = `500 ${size}px ${fontFamily}`;
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
