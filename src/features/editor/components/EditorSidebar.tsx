"use client";

import { Blend, Film, Music, Sparkles, Type, type LucideIcon } from "lucide-react";
import { cn } from "cn";

import { useEditorStore, type EditorTool } from "../store/editorStore";

export const EDITOR_TOOLS: ReadonlyArray<{ id: EditorTool; label: string; icon: LucideIcon }> = [
  { id: "media", label: "Medios", icon: Film },
  { id: "text", label: "Texto", icon: Type },
  { id: "audio", label: "Audio", icon: Music },
  { id: "effects", label: "Efectos", icon: Sparkles },
  { id: "transitions", label: "Transiciones", icon: Blend },
];

export function EditorSidebar() {
  const activeTool = useEditorStore((state) => state.activeTool);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);

  return (
    <nav aria-label="Herramientas" className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-panel py-2">
      {EDITOR_TOOLS.map(({ id, label, icon: Icon }) => {
        const active = id === activeTool;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => setActiveTool(id)}
            className={cn(
              "flex w-[60px] flex-col items-center gap-1 rounded-lg py-2 text-[9.5px] font-medium tracking-tight transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-accent text-primary" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
