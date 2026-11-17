"use client";

import { AlertTriangle, FolderOpen, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cancelAllImports } from "@/features/media/import/importService";
import { loadProject, loadProjectLibrary } from "@/features/projects/persistence/projectPersistence";

import { useEditorStore } from "../store/editorStore";
import { EditorLayout } from "./EditorLayout";

type Status = "loading" | "ready" | "missing" | "error";

/** Carga el proyecto de la URL (memoria o IndexedDB) y monta el editor. */
export function EditorWorkspace({ projectId }: { projectId: string }) {
  const [state, setState] = useState<{ projectId: string; status: Status }>({ projectId, status: "loading" });
  const status = state.projectId === projectId ? state.status : "loading";
  const removed = useEditorStore((s) => status === "ready" && !(projectId in s.projects));

  useEffect(() => {
    let cancelled = false;
    loadProject(projectId)
      .then(async (found) => {
        if (cancelled) return;
        if (!found) {
          setState({ projectId, status: "missing" });
          return;
        }
        useEditorStore.getState().openProject(projectId);
        await loadProjectLibrary(projectId);
        if (!cancelled) setState({ projectId, status: "ready" });
      })
      .catch((error: unknown) => {
        console.error("[WebCut] No se pudo abrir el proyecto", error);
        if (!cancelled) setState({ projectId, status: "error" });
      });
    return () => {
      cancelled = true;
      cancelAllImports();
    };
  }, [projectId]);

  if (status === "loading") {
    return (
      <main className="grid h-screen place-items-center" aria-busy="true">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Cargando proyecto" />
      </main>
    );
  }
  if (status === "missing" || removed) {
    return (
      <Message icon={<FolderOpen className="size-10 text-muted-foreground" aria-hidden />} title="Proyecto no encontrado">
        Puede que se haya eliminado o que los datos del sitio se hayan borrado en este navegador.
      </Message>
    );
  }
  if (status === "error") {
    return (
      <Message icon={<AlertTriangle className="size-10 text-destructive" aria-hidden />} title="No se pudo abrir el proyecto">
        El almacenamiento local no está disponible (por ejemplo, en algunas ventanas privadas) o los datos están dañados.
      </Message>
    );
  }
  return <EditorLayout />;
}

function Message({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      {icon}
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</p>
      </div>
      <Link href="/projects" className={buttonVariants()}>
        Ir a mis proyectos
      </Link>
    </main>
  );
}
