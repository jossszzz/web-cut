"use client";

import { cn } from "cn";
import { useState } from "react";

import { setTransitionCommand } from "@/core/commands/editCommands";
import {
  DEFAULT_TRANSITION_DURATION,
  nextAdjacent,
  previousAdjacent,
  TRANSITION_LABELS,
} from "@/core/playback/composition";
import { findClip } from "@/core/project/queries";
import type { TransitionType } from "@/core/project/schema";
import { selectActiveProject, useEditorStore } from "@/features/editor/store/editorStore";

/** Miniatura ilustrativa de cada transición (dos "planos": A en azul, B en rosa). */
const PREVIEW_CLASS: Record<TransitionType, string> = {
  crossfade: "bg-gradient-to-r from-blue-600 to-pink-600",
  fade: "bg-[linear-gradient(90deg,#2563eb,#000_45%,#000_55%,#db2777)]",
  "wipe-left": "bg-[linear-gradient(90deg,#2563eb_50%,#db2777_50%)]",
  "slide-left": "bg-[linear-gradient(90deg,#2563eb_40%,#111_40%,#111_45%,#db2777_45%)]",
};

/**
 * Aplica una transición en el corte del clip seleccionado: el de entrada si
 * hay un clip justo antes; si no, el de salida (al clip siguiente).
 */
export function TransitionsPanel() {
  const project = useEditorStore(selectActiveProject);
  const selection = useEditorStore((state) => state.selection.clipIds);
  const execute = useEditorStore((state) => state.execute);
  const selectClip = useEditorStore((state) => state.selectClip);
  const [message, setMessage] = useState<string | null>(null);

  const location = project && selection.length === 1 ? findClip(project, selection[0]) : null;
  const target = location
    ? previousAdjacent(location.track, location.clip)
      ? location.clip
      : nextAdjacent(location.track, location.clip)
    : null;
  const applicable = target !== null && location?.clip.type !== "audio" && !location?.track.locked;

  const apply = (type: TransitionType) => {
    if (!project || !target) return;
    const ok = execute(setTransitionCommand(project, target.id, { type, duration: DEFAULT_TRANSITION_DURATION }));
    if (ok) selectClip(target.id);
    setMessage(ok ? null : "No se puede añadir una transición en este corte.");
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {applicable
          ? `Se aplicará en el corte antes de «${target!.name}».`
          : "Selecciona un clip que esté pegado a otro en la misma pista para añadir una transición en el corte."}
      </p>
      <ul className="grid grid-cols-2 gap-2" aria-label="Transiciones">
        {(Object.keys(TRANSITION_LABELS) as TransitionType[]).map((type) => (
          <li key={type}>
            <button
              type="button"
              disabled={!applicable}
              onClick={() => apply(type)}
              className="group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-panel-raised text-left transition-colors outline-none hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <span className={cn("aspect-video w-full", PREVIEW_CLASS[type])} aria-hidden />
              <span className="px-2 py-1.5 text-[11px]">{TRANSITION_LABELS[type]}</span>
            </button>
          </li>
        ))}
      </ul>
      {message && <p role="alert" className="text-xs text-destructive">{message}</p>}
      <p className="text-[11px] text-muted-foreground">
        La duración y el tipo se ajustan en el inspector del clip. Las transiciones usan el último fotograma del clip
        anterior y el primero del siguiente.
      </p>
    </div>
  );
}
