"use client";

import { useEffect, useMemo, useRef } from "react";

import { prepareCanvas } from "@/lib/canvas";
import { useElementSize } from "@/lib/hooks/useElementSize";
import { selectActiveProject, useEditorStore } from "@/features/editor/store/editorStore";

import { renderPreview } from "../renderer/renderPreview";

const PADDING = 24;

/** Canvas de preview ajustado a la relación de aspecto del proyecto. */
export function PreviewCanvas() {
  const project = useEditorStore(selectActiveProject);
  const playhead = useEditorStore((state) => state.playhead);
  const clipIds = useEditorStore((state) => state.selection.clipIds);
  const selected = useMemo(() => new Set(clipIds), [clipIds]);

  const [containerRef, container] = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const aspect = project ? project.settings.width / project.settings.height : 16 / 9;
  const availableW = Math.max(0, container.width - PADDING * 2);
  const availableH = Math.max(0, container.height - PADDING * 2);
  const width = Math.floor(Math.min(availableW, availableH * aspect));
  const height = Math.floor(width / aspect);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project || width <= 0 || height <= 0) return;
    const ctx = prepareCanvas(canvas, width, height);
    if (ctx) renderPreview(ctx, { project, time: playhead, selectedClipIds: selected, width, height });
  }, [project, playhead, selected, width, height]);

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 items-center justify-center bg-canvas">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={project ? `Vista previa de ${project.name}` : "Vista previa"}
        style={{ width, height }}
        className="rounded-sm shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
      />
    </div>
  );
}
