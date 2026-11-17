"use client";

import { FolderOpen } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { buttonVariants } from "@/components/ui/button";

import { useEditorStore } from "../store/editorStore";
import { EditorLayout } from "./EditorLayout";

/** Carga el proyecto de la URL en el store y monta el editor. */
export function EditorWorkspace({ projectId }: { projectId: string }) {
  const exists = useEditorStore((state) => projectId in state.projects);
  const isActive = useEditorStore((state) => state.activeProjectId === projectId);
  const openProject = useEditorStore((state) => state.openProject);

  useEffect(() => {
    if (exists) openProject(projectId);
  }, [exists, openProject, projectId]);

  if (!exists) return <ProjectNotFound />;
  if (!isActive) return <div className="h-screen bg-background" aria-busy="true" />;
  return <EditorLayout />;
}

function ProjectNotFound() {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <FolderOpen className="size-10 text-muted-foreground" aria-hidden />
      <div>
        <h1 className="text-lg font-semibold">Proyecto no encontrado</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          En esta versión los proyectos se guardan solo en memoria y se pierden al recargar la página.
          La persistencia local llega en la Fase 2.
        </p>
      </div>
      <Link href="/projects" className={buttonVariants()}>
        Ir a mis proyectos
      </Link>
    </main>
  );
}
