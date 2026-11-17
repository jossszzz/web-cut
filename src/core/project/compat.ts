import type { ClipType, Track, TrackType } from "./schema";

/** Tipos de pista en los que puede vivir cada tipo de clip. */
export const CLIP_TRACK_COMPAT: Record<ClipType, readonly TrackType[]> = {
  video: ["video"],
  image: ["video", "overlay"],
  text: ["overlay"],
  audio: ["audio"],
};

export function canClipLiveOn(clipType: ClipType, track: Pick<Track, "type">): boolean {
  return CLIP_TRACK_COMPAT[clipType].includes(track.type);
}
