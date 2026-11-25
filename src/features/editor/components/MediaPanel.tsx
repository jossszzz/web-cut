"use client";

import dynamic from "next/dynamic";

import { MediaLibrary } from "@/features/media/components/MediaLibrary";

import { useEditorStore, type EditorTool } from "../store/editorStore";
import { EDITOR_TOOLS } from "./EditorSidebar";

// Paneles secundarios: se cargan la primera vez que se abren.
const TextPanel = dynamic(() => import("@/features/text/components/TextPanel").then((m) => m.TextPanel), { ssr: false });
const TransitionsPanel = dynamic(
  () => import("@/features/transitions/components/TransitionsPanel").then((m) => m.TransitionsPanel),
  { ssr: false },
);

const COMING_SOON: Partial<Record<EditorTool, string>> = {
  audio: "Importa música y sonidos desde Medios. El volumen y la velocidad de cada clip se ajustan en el inspector.",
  effects: "Los filtros y efectos visuales llegarán en una próxima versión.",
};

/** Panel izquierdo de 260 px; su contenido depende de la herramienta activa. */
export function MediaPanel() {
  const activeTool = useEditorStore((state) => state.activeTool);
  const title = EDITOR_TOOLS.find((tool) => tool.id === activeTool)?.label ?? "";

  return (
    <aside aria-label={title} className="flex w-[260px] shrink-0 flex-col border-r border-border bg-panel">
      <h2 className="flex h-10 shrink-0 items-center border-b border-border px-4 text-sm font-medium">{title}</h2>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {activeTool === "media" && <MediaLibrary />}
        {activeTool === "text" && <TextPanel />}
        {activeTool === "transitions" && <TransitionsPanel />}
        {COMING_SOON[activeTool] && (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            {COMING_SOON[activeTool]}
          </p>
        )}
      </div>
    </aside>
  );
}
