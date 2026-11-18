"use client";

import { useEffect } from "react";

import { selectActiveProject, useEditorStore } from "@/features/editor/store/editorStore";
import { useMediaStore } from "@/features/media/store/mediaStore";

import { createBrowserPlatform } from "./browserPlatform";
import { PlaybackEngine, type EngineHost, type EngineSnapshot } from "./PlaybackEngine";

let current: PlaybackEngine | null = null;
const frameListeners = new Set<() => void>();

/** Motor activo (uno por editor abierto). */
export function getPlaybackEngine(): PlaybackEngine | null {
  return current;
}

/** Avisos de "hay un frame nuevo que pintar" (reproducción, seeks, carga de datos). */
export function subscribePreviewFrames(listener: () => void): () => void {
  frameListeners.add(listener);
  return () => frameListeners.delete(listener);
}

function snapshot(): EngineSnapshot {
  const editor = useEditorStore.getState();
  return {
    project: selectActiveProject(editor),
    assets: useMediaStore.getState().assets,
    playhead: editor.playhead,
    isPlaying: editor.isPlaying,
  };
}

const sameSnapshot = (a: EngineSnapshot, b: EngineSnapshot) =>
  a.project === b.project && a.assets === b.assets && a.playhead === b.playhead && a.isPlaying === b.isPlaying;

/** Crea el motor de reproducción mientras el editor está montado. */
export function usePlaybackEngine(): void {
  useEffect(() => {
    const platform = createBrowserPlatform();
    const host: EngineHost = {
      getSnapshot: snapshot,
      subscribe(listener) {
        let prev = snapshot();
        const handle = () => {
          const next = snapshot();
          if (sameSnapshot(next, prev)) return;
          const before = prev;
          prev = next;
          listener(next, before);
        };
        const offEditor = useEditorStore.subscribe(handle);
        const offMedia = useMediaStore.subscribe(handle);
        return () => {
          offEditor();
          offMedia();
        };
      },
      setPlayhead: (time) => useEditorStore.getState().setPlayhead(time),
      setPlaying: (playing) => useEditorStore.getState().setPlaying(playing),
      setBuffering: (buffering) => useEditorStore.getState().setBuffering(buffering),
      onFrame: () => frameListeners.forEach((listener) => listener()),
    };

    const engine = new PlaybackEngine(host, platform);
    current = engine;
    engine.start();

    return () => {
      engine.dispose();
      platform.dispose();
      if (current === engine) current = null;
      useEditorStore.setState({ isPlaying: false, isBuffering: false });
    };
  }, []);
}
