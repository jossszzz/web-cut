import type { ClipType } from "@/core/project/schema";

/** Colores por tipo de clip, compartidos por timeline y preview. */
export const CLIP_COLORS: Record<ClipType, { fill: string; stroke: string; label: string }> = {
  video: { fill: "#2563eb", stroke: "#60a5fa", label: "Video" },
  image: { fill: "#b45309", stroke: "#fbbf24", label: "Imagen" },
  text: { fill: "#be185d", stroke: "#f472b6", label: "Texto" },
  audio: { fill: "#047857", stroke: "#34d399", label: "Audio" },
};
