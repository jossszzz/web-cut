"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { removeClipsCommand } from "@/core/commands/projectCommands";
import { findClip, findTrack } from "@/core/project/queries";

import { selectActiveProject, useEditorStore } from "../store/editorStore";
import { ClipInspector } from "./inspector/ClipInspector";
import { InspectorSection } from "./inspector/fields";
import { ProjectInspector } from "./inspector/ProjectInspector";
import { TrackInspector } from "./inspector/TrackInspector";

/** Panel derecho de 280 px: propiedades del clip, pista o proyecto seleccionado. */
export function InspectorPanel() {
  const project = useEditorStore(selectActiveProject);
  const selection = useEditorStore((state) => state.selection);
  const execute = useEditorStore((state) => state.execute);
  if (!project) return null;

  const clipLocation = selection.clipIds.length === 1 ? findClip(project, selection.clipIds[0]) : null;
  const track = selection.trackId ? findTrack(project, selection.trackId) : null;

  let content;
  if (clipLocation) {
    // `key` reinicia los borradores de los campos al cambiar de clip.
    content = <ClipInspector key={clipLocation.clip.id} project={project} location={clipLocation} />;
  } else if (selection.clipIds.length > 1) {
    content = (
      <InspectorSection title="Selección múltiple">
        <p className="text-sm">{selection.clipIds.length} clips seleccionados</p>
        <Button variant="destructive" size="sm" onClick={() => execute(removeClipsCommand(project, selection.clipIds))}>
          <Trash2 data-icon="inline-start" />
          Eliminar clips
        </Button>
      </InspectorSection>
    );
  } else if (track) {
    content = <TrackInspector key={track.id} project={project} track={track} />;
  } else {
    content = <ProjectInspector project={project} />;
  }

  return (
    <aside aria-label="Inspector" className="flex w-[280px] shrink-0 flex-col border-l border-border bg-panel">
      <h2 className="flex h-10 shrink-0 items-center border-b border-border px-4 text-sm font-medium">Propiedades</h2>
      <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
    </aside>
  );
}
