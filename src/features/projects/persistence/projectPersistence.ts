"use client";

import { useEffect } from "react";

import type { Project } from "@/core/project/schema";
import {
  selectActiveProject,
  useEditorStore,
  type ProjectTemplate,
} from "@/features/editor/store/editorStore";
import { useMediaStore } from "@/features/media/store/mediaStore";
import { releaseFrameSources } from "@/features/preview/renderer/frameSources";
import { getRepositories } from "@/infrastructure";

/** Versiones de proyecto que ya están en IndexedDB (por identidad: el modelo es inmutable). */
const persisted = new WeakSet<Project>();

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function loadAllProjects(): Promise<void> {
  const projects = await getRepositories().projects.getAll();
  projects.forEach((p) => persisted.add(p));
  useEditorStore.getState().hydrateProjects(projects);
}

/** Garantiza que el proyecto esté en el store. Devuelve `false` si no existe. */
export async function loadProject(projectId: string): Promise<boolean> {
  if (useEditorStore.getState().projects[projectId]) return true;
  const project = await getRepositories().projects.getById(projectId);
  if (!project) return false;
  persisted.add(project);
  useEditorStore.getState().hydrateProjects([project], { complete: false });
  return true;
}

export async function createProject(input: { name: string; template: ProjectTemplate }): Promise<Project> {
  const project = useEditorStore.getState().createProject(input);
  await getRepositories().projects.save(project);
  persisted.add(project);
  return project;
}

export async function deleteProject(projectId: string): Promise<void> {
  await getRepositories().projects.delete(projectId);
  useEditorStore.getState().removeProject(projectId);
  if (useMediaStore.getState().projectId === projectId) {
    releaseFrameSources();
    useMediaStore.setState({ projectId: null, assets: {}, status: "idle", importJobs: [] });
  }
}

export async function loadProjectLibrary(projectId: string): Promise<void> {
  const media = useMediaStore.getState();
  if (media.projectId !== projectId) releaseFrameSources();
  media.setStatus("loading");
  try {
    const assets = await getRepositories().assets.getByProject(projectId);
    useMediaStore.getState().setLibrary(projectId, assets);
  } catch (error) {
    console.error("[WebCut] No se pudo cargar la biblioteca", error);
    useMediaStore.setState({ projectId, assets: {}, status: "error" });
  }
}

/* ------------------------------------------------------------------ */
/* Autoguardado                                                        */
/* ------------------------------------------------------------------ */

const AUTOSAVE_DELAY_MS = 500;
let pending: Project | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let chain: Promise<void> = Promise.resolve();

function flush(): Promise<void> {
  clearTimeout(timer);
  const project = pending;
  pending = null;
  if (!project) return chain;
  const { setSaveStatus } = useEditorStore.getState();
  setSaveStatus("saving");
  // Encadenar para que las escrituras nunca se reordenen.
  chain = chain
    .then(() => getRepositories().projects.save(project))
    .then(() => {
      persisted.add(project);
      if (!pending) useEditorStore.getState().setSaveStatus("saved");
    })
    .catch((error: unknown) => {
      console.error("[WebCut] Error al guardar", error);
      useEditorStore.getState().setSaveStatus("error", errorMessage(error, "No se pudo guardar el proyecto."));
    });
  return chain;
}

/** Guarda el proyecto activo en IndexedDB poco después de cada cambio. */
export function useAutosave(): void {
  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      const project = selectActiveProject(state);
      if (!project || project === selectActiveProject(prev) || persisted.has(project)) return;
      pending = project;
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    });
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      void flush();
    };
  }, []);
}
