import { addClipCommand } from "@/core/commands/projectCommands";
import {
  countAssetUsage,
  createClipFromAsset,
  clipDurationForAsset,
  findInsertionStart,
  isTrackCompatible,
  pickTargetTrack,
} from "@/core/media/placement";
import { findTrack } from "@/core/project/queries";
import type { MediaAsset } from "@/core/project/schema";
import type { Microseconds } from "@/core/types/time";
import { selectActiveProject, useEditorStore } from "@/features/editor/store/editorStore";
import { getRepositories } from "@/infrastructure";
import { releaseFrameSources } from "@/features/preview/renderer/frameSources";

import { useMediaStore } from "./store/mediaStore";

export type AddResult = { ok: true } | { ok: false; reason: string };

/**
 * Añade un asset al timeline como clip. Sin opciones: en la pista por defecto
 * y en el playhead (o al final de la pista si el hueco está ocupado).
 */
export function addAssetToTimeline(
  asset: MediaAsset,
  { trackId, at }: { trackId?: string; at?: Microseconds } = {},
): AddResult {
  const editor = useEditorStore.getState();
  const project = selectActiveProject(editor);
  if (!project) return { ok: false, reason: "No hay un proyecto abierto." };

  const requested = trackId ? findTrack(project, trackId) : null;
  const track =
    requested && !requested.locked && isTrackCompatible(requested, asset.kind)
      ? requested
      : pickTargetTrack(project, asset.kind);
  if (!track) return { ok: false, reason: "No hay una pista compatible desbloqueada." };

  const start = findInsertionStart(track, at ?? editor.playhead, clipDurationForAsset(asset));
  const clip = createClipFromAsset(asset, start);
  if (!editor.execute(addClipCommand(project, track.id, clip))) {
    return { ok: false, reason: "No se pudo añadir el clip." };
  }
  editor.selectClip(clip.id);
  return { ok: true };
}

/** Elimina un asset de la biblioteca si ningún clip lo usa. */
export async function deleteAsset(asset: MediaAsset): Promise<AddResult> {
  const project = selectActiveProject(useEditorStore.getState());
  const usage = project ? countAssetUsage(project, asset.id) : 0;
  if (usage > 0) {
    return {
      ok: false,
      reason: `Se usa en ${usage} ${usage === 1 ? "clip" : "clips"} del timeline. Elimínalos primero.`,
    };
  }
  try {
    await getRepositories().assets.delete(asset.id);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "No se pudo eliminar." };
  }
  releaseFrameSources([asset.id]);
  useMediaStore.getState().removeAsset(asset.id);
  return { ok: true };
}

/** Tipo MIME propio para arrastrar assets de la biblioteca al timeline. */
export const ASSET_DRAG_TYPE = "application/x-webcut-asset";
