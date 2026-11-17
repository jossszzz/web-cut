"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateTrackCommand, type TrackPatch } from "@/core/commands/projectCommands";
import type { Project, Track } from "@/core/project/schema";

import { useEditorStore } from "../../store/editorStore";
import { InspectorSection, ReadOnlyField, TextField } from "./fields";

const TRACK_TYPE_LABEL: Record<Track["type"], string> = {
  video: "Video",
  overlay: "Superposición / texto",
  audio: "Audio",
};

function SwitchRow({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function TrackInspector({ project, track }: { project: Project; track: Track }) {
  const execute = useEditorStore((state) => state.execute);
  const update = (patch: TrackPatch, label: string) =>
    execute(updateTrackCommand(project, track.id, patch, { label }));

  return (
    <>
      <InspectorSection title="Pista">
        <TextField
          label="Nombre"
          value={track.name}
          onCommit={(name) => name.trim() && update({ name: name.trim() }, "Renombrar pista")}
        />
        <ReadOnlyField label="Tipo" value={TRACK_TYPE_LABEL[track.type]} />
        <ReadOnlyField label="Clips" value={String(track.clips.length)} />
      </InspectorSection>
      <InspectorSection title="Estado">
        {track.type !== "audio" && (
          <SwitchRow
            id={`${track.id}-visible`}
            label="Visible"
            checked={track.visible}
            onChange={(visible) => update({ visible }, "Visibilidad de pista")}
          />
        )}
        {track.type !== "overlay" && (
          <SwitchRow
            id={`${track.id}-muted`}
            label="Silenciada"
            checked={track.muted}
            onChange={(muted) => update({ muted }, "Silenciar pista")}
          />
        )}
        <SwitchRow
          id={`${track.id}-locked`}
          label="Bloqueada"
          checked={track.locked}
          onChange={(locked) => update({ locked }, "Bloquear pista")}
        />
      </InspectorSection>
    </>
  );
}
