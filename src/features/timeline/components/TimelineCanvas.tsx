"use client";

import { useEffect, useMemo, useRef, type DragEvent, type PointerEvent } from "react";

import { getProjectDuration } from "@/core/project/queries";
import type { Project } from "@/core/project/schema";
import {
  DEFAULT_TIMELINE_LAYOUT,
  getContentHeight,
  hitTest,
  xToTime,
} from "@/core/timeline/geometry";
import { usToSeconds } from "@/core/types/time";
import { selectActiveProject, useEditorStore } from "@/features/editor/store/editorStore";
import { addAssetToTimeline, ASSET_DRAG_TYPE } from "@/features/media/actions";
import { useMediaStore } from "@/features/media/store/mediaStore";
import { getFrameSource, useFrameSourcesVersion } from "@/features/preview/renderer/frameSources";
import { prepareCanvas } from "@/lib/canvas";
import { useElementSize } from "@/lib/hooks/useElementSize";

import { renderTimeline } from "../engine/renderTimeline";

const layout = DEFAULT_TIMELINE_LAYOUT;

function maxScrollX(project: Project, pxPerSecond: number, width: number): number {
  const contentWidth = (usToSeconds(getProjectDuration(project)) + 10) * pxPerSecond;
  return Math.max(0, contentWidth - width);
}

/** Área de pistas renderizada con Canvas 2D. Gestiona selección, scrubbing, scroll y zoom. */
export function TimelineCanvas() {
  const project = useEditorStore(selectActiveProject);
  const selection = useEditorStore((state) => state.selection);
  const playhead = useEditorStore((state) => state.playhead);
  const viewport = useEditorStore((state) => state.viewport);
  const selectedClipIds = useMemo(() => new Set(selection.clipIds), [selection.clipIds]);
  const assets = useMediaStore((state) => state.assets);
  const framesVersion = useFrameSourcesVersion();

  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrubbing = useRef(false);

  const height = project ? getContentHeight(project.tracks.length, layout) : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project || size.width <= 0) return;
    const ctx = prepareCanvas(canvas, size.width, height);
    if (!ctx) return;
    renderTimeline(ctx, {
      project,
      selectedTrackId: selection.trackId,
      selectedClipIds,
      assets,
      getFrameSource,
      playhead,
      viewport,
      layout,
      width: size.width,
      height,
    });
  }, [project, selection.trackId, selectedClipIds, assets, framesVersion, playhead, viewport, size.width, height]);

  // Rueda: desplazamiento horizontal y zoom con ⌘/Ctrl. Necesita listener no pasivo.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      const state = useEditorStore.getState();
      const current = selectActiveProject(state);
      if (!current) return;
      const x = event.clientX - canvas.getBoundingClientRect().left;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        state.zoomBy(Math.exp(-event.deltaY * 0.01), x);
        return;
      }
      const delta = event.deltaX !== 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      if (delta === 0) return;
      event.preventDefault();
      const { viewport: vp } = state;
      const max = maxScrollX(current, vp.pxPerSecond, canvas.clientWidth);
      state.setViewport({ ...vp, scrollX: Math.min(max, Math.max(0, vp.scrollX + delta)) });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  if (!project) return null;

  const localPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const { x, y } = localPoint(event);
    const state = useEditorStore.getState();
    const hit = hitTest(project, x, y, viewport, layout);
    switch (hit.kind) {
      case "ruler":
        scrubbing.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        state.setPlaying(false);
        state.setPlayhead(xToTime(x, viewport));
        break;
      case "clip":
        state.selectClip(hit.clipId, { additive: event.shiftKey || event.metaKey || event.ctrlKey });
        break;
      case "track":
        state.selectTrack(hit.trackId);
        break;
      case "empty":
        state.clearSelection();
        break;
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!scrubbing.current) return;
    const { x } = localPoint(event);
    useEditorStore.getState().setPlayhead(xToTime(x, useEditorStore.getState().viewport));
  };

  const endScrub = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const isAssetDrag = (event: DragEvent) => event.dataTransfer.types.includes(ASSET_DRAG_TYPE);

  const onDrop = (event: DragEvent<HTMLCanvasElement>) => {
    if (!isAssetDrag(event)) return;
    event.preventDefault();
    const asset = useMediaStore.getState().assets[event.dataTransfer.getData(ASSET_DRAG_TYPE)];
    if (!asset) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const hit = hitTest(project, x, event.clientY - rect.top, viewport, layout);
    addAssetToTimeline(asset, {
      trackId: hit.kind === "clip" || hit.kind === "track" ? hit.trackId : undefined,
      at: xToTime(x, viewport),
    });
  };

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <canvas
        ref={canvasRef}
        data-testid="timeline-canvas"
        aria-hidden
        style={{ width: "100%", height }}
        className="block cursor-default touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onDragOver={(event) => {
          if (!isAssetDrag(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={onDrop}
      />
    </div>
  );
}
