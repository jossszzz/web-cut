"use client";

import { useEffect } from "react";

import { removeClipsCommand } from "@/core/commands/projectCommands";
import { frameToUs, secondsToUs, usToFrame } from "@/core/types/time";

import { selectActiveProject, useEditorStore } from "../store/editorStore";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/**
 * Atajos globales del editor:
 * Espacio reproducir/pausar · ⌘/Ctrl+Z deshacer · ⇧⌘/Ctrl+Z o Ctrl+Y rehacer ·
 * Supr/Retroceso eliminar · Esc deseleccionar · ←/→ frame (⇧ = 1 s).
 */
export function useEditorShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const state = useEditorStore.getState();
      const project = selectActiveProject(state);
      if (!project) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (mod && key === "y") {
        event.preventDefault();
        state.redo();
        return;
      }
      if (mod || event.altKey) return;

      switch (event.key) {
        case " ":
          // Si el foco está en un botón, dejar que el botón gestione la tecla.
          if (event.target instanceof HTMLButtonElement) return;
          event.preventDefault();
          state.togglePlaying();
          break;
        case "Delete":
        case "Backspace":
          if (state.selection.clipIds.length > 0) {
            event.preventDefault();
            state.execute(removeClipsCommand(project, state.selection.clipIds));
          }
          break;
        case "Escape":
          state.clearSelection();
          break;
        case "ArrowLeft":
        case "ArrowRight": {
          if (event.target instanceof HTMLElement && event.target.getAttribute("role") === "slider") return;
          event.preventDefault();
          const direction = event.key === "ArrowLeft" ? -1 : 1;
          const { fps } = project.settings;
          const next = event.shiftKey
            ? state.playhead + direction * secondsToUs(1)
            : frameToUs(usToFrame(state.playhead, fps) + direction, fps);
          state.setPlayhead(next);
          break;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
