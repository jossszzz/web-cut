import { clipEnd, getProjectDuration } from "../project/queries";
import type { Clip, MediaAsset, Project, Track } from "../project/schema";

/**
 * Análisis previo a la exportación: qué clips necesitan decodificar video o
 * audio y qué problemas conviene avisar antes de empezar.
 */

export type ExportIssue =
  | { kind: "empty" }
  | { kind: "missing-media"; clipIds: string[]; clipNames: string[] }
  | { kind: "placeholders"; clipNames: string[] };

export interface ExportPlan {
  /** Clips de video con medio que aparecen en la imagen. */
  videoClips: Clip[];
  /** Clips con audio audible (pista sin silenciar y volumen > 0). */
  audioClips: Clip[];
  /** Assets que hay que leer (por id). */
  assetIds: string[];
  issues: ExportIssue[];
}

const isVisualTrack = (track: Track) => track.type !== "audio" && track.visible;

function hasAudibleSource(clip: Clip, asset: MediaAsset | undefined): boolean {
  if (!asset) return false;
  if (clip.type === "audio") return true;
  return clip.type === "video" && asset.hasAudio;
}

export function planExport(project: Project, assets: Readonly<Record<string, MediaAsset>>): ExportPlan {
  const videoClips: Clip[] = [];
  const audioClips: Clip[] = [];
  const assetIds = new Set<string>();
  const missing: Clip[] = [];
  const placeholders: Clip[] = [];

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.duration <= 0 || clipEnd(clip) <= 0) continue;
      const visual = clip.type !== "audio" && clip.type !== "text" && isVisualTrack(track);
      const asset = clip.assetId ? assets[clip.assetId] : undefined;

      if (clip.type !== "text" && (visual || clip.type === "audio")) {
        if (!clip.assetId) {
          if (visual) placeholders.push(clip);
        } else if (!asset) {
          missing.push(clip);
        }
      }
      if (!asset) continue;

      if (visual) {
        assetIds.add(asset.id);
        if (clip.type === "video") videoClips.push(clip);
      }
      if (!track.muted && clip.volume > 0 && hasAudibleSource(clip, asset)) {
        assetIds.add(asset.id);
        audioClips.push(clip);
      }
    }
  }

  const issues: ExportIssue[] = [];
  if (getProjectDuration(project) <= 0) issues.push({ kind: "empty" });
  if (missing.length > 0) {
    issues.push({ kind: "missing-media", clipIds: missing.map((c) => c.id), clipNames: missing.map((c) => c.name) });
  }
  if (placeholders.length > 0) issues.push({ kind: "placeholders", clipNames: placeholders.map((c) => c.name) });

  return { videoClips, audioClips, assetIds: [...assetIds], issues };
}

/** ¿Algún problema impide exportar? */
export function isBlocking(issue: ExportIssue): boolean {
  return issue.kind === "empty";
}
