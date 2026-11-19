"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import type { Clip, MediaAsset } from "@/core/project/schema";
import { selectActiveProject, useEditorStore } from "@/features/editor/store/editorStore";
import { useMediaStore } from "@/features/media/store/mediaStore";
import { prepareCanvas } from "@/lib/canvas";
import { useElementSize } from "@/lib/hooks/useElementSize";

import { getPlaybackEngine, subscribePreviewFrames } from "../engine/usePlaybackEngine";
import { getFrameSource, useFrameSourcesVersion } from "../renderer/frameSources";
import type { PreviewBox } from "../renderer/previewGeometry";
import { renderPreview, type ClipImage } from "../renderer/renderPreview";
import { usePreviewGestures } from "./usePreviewGestures";

const PADDING = 24;
const UNPLAYABLE = "Este navegador no puede reproducir el video";

/** Imagen de un clip: frame real del video si está listo; si no, miniatura o imagen. */
function getClipImage(clip: Clip, asset: MediaAsset): ClipImage | null {
  if (asset.kind === "video") {
    const frame = getPlaybackEngine()?.getVideoFrame(clip.id) ?? null;
    if (frame && "image" in frame) return { image: frame.image as unknown as HTMLVideoElement };
    const thumbnail = getFrameSource(asset);
    if (!thumbnail) return null;
    return frame && "failed" in frame ? { image: thumbnail, note: UNPLAYABLE } : { image: thumbnail };
  }
  const image = getFrameSource(asset);
  return image ? { image } : null;
}

/**
 * Canvas de preview ajustado a la relación de aspecto del proyecto.
 * Se pinta de forma imperativa (fuera del ciclo de React) cuando el motor
 * avisa de un frame nuevo o cambia algo visible.
 */
export function PreviewCanvas() {
  const project = useEditorStore(selectActiveProject);
  const previewScale = useEditorStore((state) => state.previewScale);
  const isBuffering = useEditorStore((state) => state.isBuffering);
  const framesVersion = useFrameSourcesVersion();

  const [containerRef, container] = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxesRef = useRef<PreviewBox[]>([]);

  const aspect = project ? project.settings.width / project.settings.height : 16 / 9;
  const availableW = Math.max(0, container.width - PADDING * 2);
  const availableH = Math.max(0, container.height - PADDING * 2);
  const width = Math.floor(Math.min(availableW, availableH * aspect));
  const height = Math.floor(width / aspect);
  const gestures = usePreviewGestures(boxesRef, width);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const editor = useEditorStore.getState();
    const current = selectActiveProject(editor);
    if (!canvas || !current || width <= 0 || height <= 0) return;
    const ctx = prepareCanvas(canvas, width, height, editor.previewScale);
    if (!ctx) return;
    boxesRef.current = renderPreview(ctx, {
      project: current,
      time: editor.playhead,
      selectedClipIds: new Set(editor.selection.clipIds),
      assets: useMediaStore.getState().assets,
      getClipImage,
      width,
      height,
    });
  }, [width, height]);

  useEffect(() => {
    draw();
    const offFrames = subscribePreviewFrames(draw);
    // Cambios de edición, selección, scrub o calidad. Durante la reproducción el
    // playhead lo mueve el motor, que ya avisa por `subscribePreviewFrames`.
    const offEditor = useEditorStore.subscribe((state, prev) => {
      const playheadMoved = state.playhead !== prev.playhead && !state.isPlaying;
      if (
        playheadMoved ||
        state.projects !== prev.projects ||
        state.selection !== prev.selection ||
        state.previewScale !== prev.previewScale
      ) {
        draw();
      }
    });
    const offMedia = useMediaStore.subscribe(draw);
    return () => {
      offFrames();
      offEditor();
      offMedia();
    };
  }, [draw, framesVersion]);

  return (
    <div ref={containerRef} className="relative flex min-h-0 flex-1 items-center justify-center bg-canvas">
      <canvas
        ref={canvasRef}
        role="img"
        data-testid="preview-canvas"
        data-scale={previewScale}
        aria-label={project ? `Vista previa de ${project.name}` : "Vista previa"}
        style={{ width, height }}
        className="touch-none rounded-sm shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
        {...gestures}
      />
      {isBuffering && (
        <div
          role="status"
          className="absolute inset-0 grid place-items-center bg-black/30"
          data-testid="preview-buffering"
        >
          <span className="flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Cargando…
          </span>
        </div>
      )}
    </div>
  );
}
