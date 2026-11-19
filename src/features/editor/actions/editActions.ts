import { composeCommands } from "@/core/commands/compose";
import { splitClipsCommand, trimAtTime } from "@/core/commands/editCommands";
import { setClipTimingCommand } from "@/core/commands/timelineCommands";
import { clipEnd, findClip } from "@/core/project/queries";
import type { Project } from "@/core/project/schema";

import { selectActiveProject, useEditorStore } from "../store/editorStore";

/** Clips afectados: la selección o, si no hay, los que están bajo el playhead en pistas desbloqueadas. */
function targetClipIds(project: Project, time: number, selection: readonly string[]): string[] {
  if (selection.length > 0) return [...selection];
  return project.tracks
    .filter((t) => !t.locked)
    .flatMap((t) => t.clips.filter((c) => time > c.start && time < clipEnd(c)).map((c) => c.id));
}

/** Divide en el playhead (⌘/Ctrl+B). */
export function splitAtPlayhead(): boolean {
  const store = useEditorStore.getState();
  const project = selectActiveProject(store);
  if (!project) return false;
  const result = splitClipsCommand(project, store.playhead, targetClipIds(project, store.playhead, store.selection.clipIds));
  return result ? store.execute(result.command) : false;
}

/** Elimina la parte izquierda (Q) o derecha (W) de los clips en el playhead. */
export function trimAtPlayhead(side: "left" | "right"): boolean {
  const store = useEditorStore.getState();
  const project = selectActiveProject(store);
  if (!project) return false;
  const time = store.playhead;
  const commands = targetClipIds(project, time, store.selection.clipIds).map((id) => {
    const clip = findClip(project, id)?.clip;
    const timing = clip ? trimAtTime(clip, time, side) : null;
    return timing ? setClipTimingCommand(project, id, timing) : null;
  });
  return store.execute(composeCommands(side === "left" ? "Recortar inicio" : "Recortar final", commands));
}

/** ¿Hay algo que dividir/recortar en el playhead? (para habilitar botones) */
export function canEditAtPlayhead(project: Project, time: number, selection: readonly string[]): boolean {
  return targetClipIds(project, time, selection).some((id) => {
    const location = findClip(project, id);
    return location !== null && !location.track.locked && time > location.clip.start && time < clipEnd(location.clip);
  });
}
