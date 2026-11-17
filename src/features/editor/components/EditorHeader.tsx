"use client";

import { AlertCircle, Check, Clapperboard, Download, Loader2, Redo2, Undo2 } from "lucide-react";
import Link from "next/link";

import { IconButton } from "@/components/shared/IconButton";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { canRedo, canUndo } from "@/core/commands/history";

import { selectActiveProject, useEditorStore } from "../store/editorStore";

export function EditorHeader() {
  const project = useEditorStore(selectActiveProject);
  const history = useEditorStore((state) => state.history);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const saveStatus = useEditorStore((state) => state.saveStatus);
  const saveError = useEditorStore((state) => state.saveError);
  if (!project) return null;

  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  const mod = isMac ? "⌘" : "Ctrl+";

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-panel px-3">
      <Link
        href="/projects"
        className="flex items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold hover:bg-accent"
        aria-label="WebCut Studio — volver a proyectos"
      >
        <Clapperboard className="size-5 text-primary" aria-hidden />
        <span>WebCut</span>
      </Link>

      <div className="h-5 w-px bg-border" aria-hidden />

      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-sm font-medium" title={project.name}>
          {project.name}
        </h1>
        <span role="status" className="flex items-center gap-1 text-xs text-muted-foreground">
          {saveStatus === "saving" && (
            <>
              <Loader2 className="size-3 animate-spin" aria-hidden /> Guardando…
            </>
          )}
          {saveStatus === "saved" && (
            <>
              <Check className="size-3" aria-hidden /> Guardado en este dispositivo
            </>
          )}
          {saveStatus === "error" && (
            <span className="flex items-center gap-1 text-destructive" title={saveError ?? undefined}>
              <AlertCircle className="size-3" aria-hidden /> {saveError ?? "Error al guardar"}
            </span>
          )}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <IconButton label="Deshacer" hint={`${mod}Z`} onClick={undo} disabled={!canUndo(history)}>
          <Undo2 />
        </IconButton>
        <IconButton label="Rehacer" hint={`⇧${mod}Z`} onClick={redo} disabled={!canRedo(history)}>
          <Redo2 />
        </IconButton>

        <div className="mx-2 h-5 w-px bg-border" aria-hidden />

        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <Button disabled size="sm">
              <Download data-icon="inline-start" />
              Exportar
            </Button>
          </TooltipTrigger>
          <TooltipContent>La exportación a MP4 llega en la Fase 6</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
