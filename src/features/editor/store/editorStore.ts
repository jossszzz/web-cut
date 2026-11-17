import { create } from "zustand";

import * as historyOps from "@/core/commands/history";
import type { Command } from "@/core/commands/types";
import { createDemoProject, createEmptyProject } from "@/core/project/factory";
import { findClip, findTrack, getProjectDuration } from "@/core/project/queries";
import type { Project } from "@/core/project/schema";
import {
  DEFAULT_VIEWPORT,
  zoomAround,
  type TimelineViewport,
} from "@/core/timeline/geometry";
import type { Microseconds } from "@/core/types/time";

export type ProjectTemplate = "empty" | "demo";
export type EditorTool = "media" | "text" | "audio" | "effects" | "transitions";

export interface Selection {
  trackId: string | null;
  clipIds: readonly string[];
}

const EMPTY_SELECTION: Selection = { trackId: null, clipIds: [] };

/**
 * Estado del editor. Solo guarda metadatos serializables: nunca `File`,
 * `Blob` ni referencias multimedia (esos irán a IndexedDB en la Fase 2).
 *
 * Sprint 1: los proyectos viven solo en memoria; se pierden al recargar.
 */
export interface EditorState {
  projects: Record<string, Project>;
  activeProjectId: string | null;
  history: historyOps.History;
  selection: Selection;
  playhead: Microseconds;
  isPlaying: boolean;
  viewport: TimelineViewport;
  activeTool: EditorTool;

  createProject(input: { name: string; template: ProjectTemplate }): Project;
  openProject(projectId: string): boolean;

  execute(command: Command | null): boolean;
  undo(): void;
  redo(): void;
  sealHistory(): void;

  selectTrack(trackId: string | null): void;
  selectClip(clipId: string, options?: { additive?: boolean }): void;
  clearSelection(): void;

  setPlayhead(time: Microseconds): void;
  setPlaying(playing: boolean): void;
  togglePlaying(): void;

  setViewport(viewport: TimelineViewport): void;
  zoomBy(factor: number, anchorX?: number): void;
  setActiveTool(tool: EditorTool): void;
}

function pruneSelection(project: Project, selection: Selection): Selection {
  const clipIds = selection.clipIds.filter((id) => findClip(project, id) !== null);
  const trackId =
    selection.trackId && findTrack(project, selection.trackId) ? selection.trackId : null;
  if (trackId === selection.trackId && clipIds.length === selection.clipIds.length) {
    return selection;
  }
  return { trackId, clipIds };
}

export const useEditorStore = create<EditorState>()((set, get) => {
  /** Reemplaza el proyecto activo tras una operación de historial. */
  const commit = (result: historyOps.HistoryResult) => {
    const { activeProjectId, projects, selection } = get();
    if (!activeProjectId) return;
    const project = { ...result.project, updatedAt: Date.now() };
    set({
      projects: { ...projects, [activeProjectId]: project },
      history: result.history,
      selection: pruneSelection(project, selection),
    });
  };

  const activeProject = (): Project | null => {
    const { activeProjectId, projects } = get();
    return activeProjectId ? (projects[activeProjectId] ?? null) : null;
  };

  return {
    projects: {},
    activeProjectId: null,
    history: historyOps.createHistory(),
    selection: EMPTY_SELECTION,
    playhead: 0,
    isPlaying: false,
    viewport: DEFAULT_VIEWPORT,
    activeTool: "media",

    createProject: ({ name, template }) => {
      const project =
        template === "demo" ? createDemoProject({ name }) : createEmptyProject({ name });
      set((state) => ({ projects: { ...state.projects, [project.id]: project } }));
      return project;
    },

    openProject: (projectId) => {
      if (!get().projects[projectId]) return false;
      if (get().activeProjectId === projectId) return true;
      set({
        activeProjectId: projectId,
        history: historyOps.createHistory(),
        selection: EMPTY_SELECTION,
        playhead: 0,
        isPlaying: false,
        viewport: DEFAULT_VIEWPORT,
      });
      return true;
    },

    execute: (command) => {
      const project = activeProject();
      if (!project || !command) return false;
      commit(historyOps.executeCommand(project, get().history, command));
      return true;
    },

    undo: () => {
      const project = activeProject();
      if (project) commit(historyOps.undo(project, get().history));
    },

    redo: () => {
      const project = activeProject();
      if (project) commit(historyOps.redo(project, get().history));
    },

    sealHistory: () => set((state) => ({ history: historyOps.sealHistory(state.history) })),

    selectTrack: (trackId) => set({ selection: { trackId, clipIds: [] } }),

    selectClip: (clipId, { additive = false } = {}) => {
      const project = activeProject();
      const location = project ? findClip(project, clipId) : null;
      if (!location) return;
      const { selection } = get();
      if (!additive) {
        set({ selection: { trackId: location.track.id, clipIds: [clipId] } });
        return;
      }
      const alreadySelected = selection.clipIds.includes(clipId);
      set({
        selection: {
          trackId: location.track.id,
          clipIds: alreadySelected
            ? selection.clipIds.filter((id) => id !== clipId)
            : [...selection.clipIds, clipId],
        },
      });
    },

    clearSelection: () => set({ selection: EMPTY_SELECTION }),

    setPlayhead: (time) => {
      const project = activeProject();
      const max = project ? getProjectDuration(project) : 0;
      set({ playhead: Math.min(Math.max(0, Math.round(time)), Math.max(max, 0)) });
    },

    setPlaying: (playing) => {
      const project = activeProject();
      if (!project) return;
      const duration = getProjectDuration(project);
      if (playing && duration === 0) return;
      // Reiniciar desde el principio si el playhead está al final.
      if (playing && get().playhead >= duration) set({ playhead: 0 });
      set({ isPlaying: playing });
    },

    togglePlaying: () => get().setPlaying(!get().isPlaying),

    setViewport: (viewport) => set({ viewport }),

    zoomBy: (factor, anchorX = 0) =>
      set((state) => ({ viewport: zoomAround(state.viewport, factor, anchorX) })),

    setActiveTool: (tool) => set({ activeTool: tool }),
  };
});

/** Proyecto activo (o `null`). */
export const selectActiveProject = (state: EditorState): Project | null =>
  state.activeProjectId ? (state.projects[state.activeProjectId] ?? null) : null;
