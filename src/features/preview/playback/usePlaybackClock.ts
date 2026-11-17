"use client";

import { useEffect } from "react";

import { getProjectDuration } from "@/core/project/queries";
import { secondsToUs } from "@/core/types/time";
import { selectActiveProject, useEditorStore } from "@/features/editor/store/editorStore";

/**
 * Reloj de reproducción basado en requestAnimationFrame. En el Sprint 1 solo
 * avanza el playhead (no hay medios que sincronizar todavía).
 */
export function usePlaybackClock(): void {
  const isPlaying = useEditorStore((state) => state.isPlaying);

  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const state = useEditorStore.getState();
      const project = selectActiveProject(state);
      if (!project || !state.isPlaying) return;
      const duration = getProjectDuration(project);
      const next = state.playhead + secondsToUs((now - last) / 1000);
      last = now;
      if (next >= duration) {
        state.setPlayhead(duration);
        state.setPlaying(false);
        return;
      }
      state.setPlayhead(next);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);
}
