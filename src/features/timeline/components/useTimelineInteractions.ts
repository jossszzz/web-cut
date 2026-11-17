"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

import { moveClipsCommand, setClipTimingCommand } from "@/core/commands/timelineCommands";
import { findClip } from "@/core/project/queries";
import type { Project } from "@/core/project/schema";
import { resolveMove, resolveTrim, type MoveResult, type TrimEdge, type TrimResult } from "@/core/timeline/edit";
import {
  clipsInRect,
  DEFAULT_TIMELINE_LAYOUT as layout,
  hitTest,
  normalizeRect,
  trackIndexAtY,
  xToTime,
  type Rect,
  type TimelineViewport,
} from "@/core/timeline/geometry";
import { collectSnapPoints, snapThresholdUs } from "@/core/timeline/snapping";
import { frameToUs, US_PER_SECOND, type Microseconds } from "@/core/types/time";
import { selectActiveProject, useEditorStore } from "@/features/editor/store/editorStore";
import { useMediaStore } from "@/features/media/store/mediaStore";

/** Píxeles que hay que arrastrar antes de considerar que empieza un gesto. */
const DRAG_THRESHOLD_PX = 3;
/** Distancia al borde del canvas que activa el desplazamiento automático. */
const AUTOSCROLL_EDGE_PX = 24;
const AUTOSCROLL_STEP_PX = 12;

interface Base {
  pointerId: number;
  originX: number;
  originY: number;
  started: boolean;
  project: Project;
}

type Drag =
  | ({ kind: "scrub" } & Base)
  | ({
      kind: "move";
      clipIds: string[];
      originTime: Microseconds;
      originRow: number;
      snapPoints: Microseconds[];
      result: MoveResult | null;
    } & Base)
  | ({
      kind: "trim";
      clipId: string;
      edge: TrimEdge;
      /** Distancia entre el borde y el punto donde se agarró, para que no "salte". */
      grabOffset: Microseconds;
      sourceDuration?: Microseconds;
      snapPoints: Microseconds[];
      result: TrimResult | null;
    } & Base)
  | ({ kind: "marquee"; additive: boolean; initial: readonly string[]; fallback: () => void } & Base);

export interface TimelinePreview {
  /** Proyecto con la edición en curso aplicada (aún no está en el historial). */
  project: Project | null;
  snapTime: Microseconds | null;
  marquee: Rect | null;
}

const IDLE: TimelinePreview = { project: null, snapTime: null, marquee: null };

/** Tiempo bajo `x` sin limitar a 0 (para calcular desplazamientos). */
function rawTime(x: number, viewport: TimelineViewport): Microseconds {
  return Math.round(((x + viewport.scrollX) / viewport.pxPerSecond) * US_PER_SECOND);
}

function localPoint(event: PointerEvent<HTMLCanvasElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/**
 * Gestos del timeline: scrub en la regla, mover clips (también entre pistas),
 * recortar bordes, selección por rectángulo y cancelación con Esc.
 * Mientras dura el gesto se muestra una vista previa; al soltar se ejecuta un
 * único comando (un solo paso de deshacer).
 */
export function useTimelineInteractions() {
  const drag = useRef<Drag | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<TimelinePreview>(IDLE);

  const end = () => {
    const current = drag.current;
    drag.current = null;
    setPreview(IDLE);
    if (current && canvasRef.current?.hasPointerCapture(current.pointerId)) {
      canvasRef.current.releasePointerCapture(current.pointerId);
    }
  };

  // Esc cancela el gesto en curso sin que llegue a los atajos globales.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !drag.current) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      const current = drag.current;
      if (current.kind === "marquee") useEditorStore.getState().setSelection(current.initial);
      end();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    canvasRef.current = event.currentTarget;
    const store = useEditorStore.getState();
    const project = selectActiveProject(store);
    if (!project) return;
    const { x, y } = localPoint(event);
    const { viewport } = store;
    const hit = hitTest(project, x, y, viewport, layout);
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const base: Base = { pointerId: event.pointerId, originX: x, originY: y, started: false, project };

    let next: Drag | null = null;
    if (hit.kind === "ruler") {
      store.setPlaying(false);
      store.setPlayhead(xToTime(x, viewport));
      next = { kind: "scrub", ...base, started: true };
    } else if (hit.kind === "clip") {
      const location = findClip(project, hit.clipId);
      const locked = location?.track.locked ?? true;
      if (additive) {
        store.selectClip(hit.clipId, { additive: true });
      } else if (hit.edge && !locked && location) {
        store.selectClip(hit.clipId);
        const asset = location.clip.assetId ? useMediaStore.getState().assets[location.clip.assetId] : undefined;
        next = {
          kind: "trim",
          ...base,
          clipId: hit.clipId,
          edge: hit.edge,
          grabOffset:
            (hit.edge === "start" ? location.clip.start : location.clip.start + location.clip.duration) -
            rawTime(x, viewport),
          sourceDuration: asset?.duration,
          snapPoints: collectSnapPoints(project, { excludeClipIds: new Set([hit.clipId]), playhead: store.playhead }),
          result: null,
        };
      } else {
        if (!store.selection.clipIds.includes(hit.clipId)) store.selectClip(hit.clipId);
        const clipIds = [...useEditorStore.getState().selection.clipIds];
        if (!locked && location) {
          next = {
            kind: "move",
            ...base,
            clipIds,
            originTime: rawTime(x, viewport),
            originRow: location.trackIndex,
            snapPoints: collectSnapPoints(project, { excludeClipIds: new Set(clipIds), playhead: store.playhead }),
            result: null,
          };
        }
      }
    } else {
      const initial = additive ? [...store.selection.clipIds] : [];
      next = {
        kind: "marquee",
        ...base,
        additive,
        initial,
        // Clic sin arrastrar: seleccionar la pista o limpiar la selección.
        fallback: () => {
          if (additive) return;
          if (hit.kind === "track") store.selectTrack(hit.trackId);
          else store.clearSelection();
        },
      };
    }

    if (next) {
      drag.current = next;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const updateCursor = (canvas: HTMLCanvasElement, x: number, y: number) => {
    const store = useEditorStore.getState();
    const project = selectActiveProject(store);
    if (!project) return;
    const hit = hitTest(project, x, y, store.viewport, layout);
    const locked = hit.kind === "clip" && (findClip(project, hit.clipId)?.track.locked ?? false);
    canvas.style.cursor =
      hit.kind === "clip" && !locked ? (hit.edge ? "ew-resize" : "grab") : hit.kind === "ruler" ? "pointer" : "default";
  };

  const autoscroll = (x: number, width: number) => {
    const store = useEditorStore.getState();
    const { viewport } = store;
    if (x > width - AUTOSCROLL_EDGE_PX) {
      store.setViewport({ ...viewport, scrollX: viewport.scrollX + AUTOSCROLL_STEP_PX });
    } else if (x < AUTOSCROLL_EDGE_PX && viewport.scrollX > 0) {
      store.setViewport({ ...viewport, scrollX: Math.max(0, viewport.scrollX - AUTOSCROLL_STEP_PX) });
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = localPoint(event);
    const current = drag.current;
    const canvas = event.currentTarget;
    if (!current) {
      updateCursor(canvas, x, y);
      return;
    }
    if (!current.started) {
      if (Math.hypot(x - current.originX, y - current.originY) < DRAG_THRESHOLD_PX) return;
      current.started = true;
    }

    const store = useEditorStore.getState();
    const snapEnabled = store.snapping && !event.altKey;

    switch (current.kind) {
      case "scrub":
        store.setPlayhead(xToTime(x, store.viewport));
        break;

      case "move": {
        autoscroll(x, canvas.clientWidth);
        const viewport = useEditorStore.getState().viewport;
        const row = trackIndexAtY(y, current.project.tracks.length, layout);
        const result = resolveMove(
          current.project,
          {
            clipIds: current.clipIds,
            deltaTime: rawTime(x, viewport) - current.originTime,
            trackOffset: row - current.originRow,
          },
          snapEnabled ? { points: current.snapPoints, threshold: snapThresholdUs(viewport.pxPerSecond) } : undefined,
        );
        canvas.style.cursor = "grabbing";
        // Si el destino no es válido se mantiene la última posición válida.
        if (!result) return;
        current.result = result;
        const command = moveClipsCommand(current.project, result.moves);
        setPreview({
          project: command ? command.execute(current.project) : null,
          snapTime: result.snappedTo,
          marquee: null,
        });
        break;
      }

      case "trim": {
        autoscroll(x, canvas.clientWidth);
        const viewport = useEditorStore.getState().viewport;
        const time = Math.max(0, rawTime(x, viewport) + current.grabOffset);
        const result = resolveTrim(current.project, current.clipId, current.edge, time, {
          sourceDuration: current.sourceDuration,
          minDuration: frameToUs(1, current.project.settings.fps),
          snap: snapEnabled ? { points: current.snapPoints, threshold: snapThresholdUs(viewport.pxPerSecond) } : undefined,
        });
        if (!result) return;
        current.result = result;
        const command = setClipTimingCommand(current.project, current.clipId, result);
        setPreview({
          project: command ? command.execute(current.project) : null,
          snapTime: result.snappedTo,
          marquee: null,
        });
        break;
      }

      case "marquee": {
        const rect = normalizeRect(current.originX, current.originY, x, y);
        const ids = clipsInRect(current.project, rect, store.viewport, layout);
        store.setSelection(current.additive ? [...new Set([...current.initial, ...ids])] : ids);
        setPreview({ project: null, snapTime: null, marquee: rect });
        break;
      }
    }
  };

  const onPointerUp = () => {
    const current = drag.current;
    if (!current) return;
    const store = useEditorStore.getState();
    if (current.kind === "move" && current.started && current.result) {
      store.execute(moveClipsCommand(current.project, current.result.moves));
    } else if (current.kind === "trim" && current.started && current.result) {
      store.execute(setClipTimingCommand(current.project, current.clipId, current.result));
    } else if (current.kind === "marquee" && !current.started) {
      current.fallback();
    }
    end();
  };

  return {
    preview,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: end },
  };
}
