"use client";

import { useRef, type PointerEvent, type RefObject } from "react";

import { evaluateTransform } from "@/core/animation/keyframes";
import { setTransformCommand } from "@/core/commands/editCommands";
import { findClip } from "@/core/project/queries";
import type { Transform } from "@/core/project/schema";
import { frameToUs } from "@/core/types/time";
import { selectActiveProject, useEditorStore } from "@/features/editor/store/editorStore";

import { boxCenter, hitTestPreview, type Point, type PreviewBox, type PreviewHandle } from "../renderer/previewGeometry";

const ROTATION_SNAP_DEG = 15;
const MIN_SCALE = 0.01;
const MAX_SCALE = 20;

interface Gesture {
  pointerId: number;
  clipId: string;
  handle: PreviewHandle;
  start: Point;
  center: Point;
  initial: Transform;
  startDistance: number;
  startAngle: number;
  /** Píxeles CSS por píxel del proyecto. */
  cssScale: number;
  mergeKey: string;
}

let gestureCounter = 0;

const CURSORS: Record<PreviewHandle, string> = { body: "move", corner: "nwse-resize", rotate: "grab" };

/**
 * Manipulación directa en la preview: clic para seleccionar, arrastrar para
 * mover, esquinas para escalar y asa superior para rotar (⇧ = pasos de 15° o
 * eje fijo al mover). Cada gesto es un único paso de deshacer y, si la
 * propiedad está animada, crea/actualiza el keyframe en el playhead.
 */
export function usePreviewGestures(boxesRef: RefObject<PreviewBox[]>, cssWidth: number) {
  const gesture = useRef<Gesture | null>(null);

  const point = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const store = useEditorStore.getState();
    const project = selectActiveProject(store);
    if (!project || cssWidth <= 0) return;
    const p = point(event);
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const hit = hitTestPreview(boxesRef.current ?? [], p, new Set(store.selection.clipIds));
    if (!hit) {
      if (!additive) store.setSelection([]);
      return;
    }
    if (additive) {
      store.selectClip(hit.clipId, { additive: true });
      return;
    }
    if (!store.selection.clipIds.includes(hit.clipId)) store.selectClip(hit.clipId);

    const location = findClip(project, hit.clipId);
    const box = boxesRef.current?.find((b) => b.clipId === hit.clipId);
    if (!location || location.track.locked || !box) return;

    const center = boxCenter(box);
    gesture.current = {
      pointerId: event.pointerId,
      clipId: hit.clipId,
      handle: hit.handle,
      start: p,
      center,
      initial: evaluateTransform(location.clip, store.playhead - location.clip.start),
      startDistance: Math.max(1, Math.hypot(p.x - center.x, p.y - center.y)),
      startAngle: Math.atan2(p.y - center.y, p.x - center.x),
      cssScale: cssWidth / project.settings.width,
      mergeKey: `preview-gesture:${++gestureCounter}`,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const p = point(event);
    const g = gesture.current;
    const canvas = event.currentTarget;
    if (!g) {
      const store = useEditorStore.getState();
      const hit = hitTestPreview(boxesRef.current ?? [], p, new Set(store.selection.clipIds));
      canvas.style.cursor = hit ? CURSORS[hit.handle] : "default";
      return;
    }

    let values: Partial<Transform>;
    if (g.handle === "body") {
      let dx = (p.x - g.start.x) / g.cssScale;
      let dy = (p.y - g.start.y) / g.cssScale;
      if (event.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      values = { x: Math.round(g.initial.x + dx), y: Math.round(g.initial.y + dy) };
    } else if (g.handle === "corner") {
      const factor = Math.hypot(p.x - g.center.x, p.y - g.center.y) / g.startDistance;
      const clamp = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(v * 1000) / 1000));
      values = { scaleX: clamp(g.initial.scaleX * factor), scaleY: clamp(g.initial.scaleY * factor) };
    } else {
      const angle = Math.atan2(p.y - g.center.y, p.x - g.center.x);
      let rotation = g.initial.rotation + ((angle - g.startAngle) * 180) / Math.PI;
      if (event.shiftKey) rotation = Math.round(rotation / ROTATION_SNAP_DEG) * ROTATION_SNAP_DEG;
      values = { rotation: Math.round(rotation * 10) / 10 };
      canvas.style.cursor = "grabbing";
    }

    const store = useEditorStore.getState();
    const project = selectActiveProject(store);
    if (!project) return;
    const tolerance = Math.round(frameToUs(1, project.settings.fps) / 2);
    store.execute(
      setTransformCommand(project, g.clipId, values, { time: store.playhead, tolerance }, {
        label: g.handle === "body" ? "Mover en la preview" : g.handle === "corner" ? "Escalar" : "Rotar",
        mergeKey: g.mergeKey,
      }),
    );
  };

  const end = (event: PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(g.pointerId)) event.currentTarget.releasePointerCapture(g.pointerId);
    useEditorStore.getState().sealHistory();
  };

  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end };
}
