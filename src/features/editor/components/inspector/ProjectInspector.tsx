"use client";

import { updateProjectCommand } from "@/core/commands/projectCommands";
import { getProjectDuration } from "@/core/project/queries";
import type { Project } from "@/core/project/schema";
import { formatTimecode } from "@/core/types/time";

import { useEditorStore } from "../../store/editorStore";
import { InspectorSection, ReadOnlyField, TextField } from "./fields";

const RESOLUTIONS = [
  { label: "16:9 · 1920 × 1080", width: 1920, height: 1080 },
  { label: "9:16 · 1080 × 1920", width: 1080, height: 1920 },
  { label: "1:1 · 1080 × 1080", width: 1080, height: 1080 },
  { label: "4:5 · 1080 × 1350", width: 1080, height: 1350 },
  { label: "16:9 · 1280 × 720", width: 1280, height: 720 },
];
const FRAME_RATES = [24, 25, 30, 50, 60];

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-input/30 px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function ProjectInspector({ project }: { project: Project }) {
  const execute = useEditorStore((state) => state.execute);
  const sealHistory = useEditorStore((state) => state.sealHistory);
  const { settings } = project;
  const resolutionKey = `${settings.width}x${settings.height}`;
  const known = RESOLUTIONS.some((r) => `${r.width}x${r.height}` === resolutionKey);

  return (
    <>
      <InspectorSection title="Proyecto">
        <TextField
          label="Nombre"
          value={project.name}
          onCommit={(name) => execute(updateProjectCommand(project, { name }, { label: "Renombrar proyecto" }))}
        />
        <ReadOnlyField label="Duración" value={formatTimecode(getProjectDuration(project), settings.fps)} />
      </InspectorSection>
      <InspectorSection title="Lienzo">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="project-resolution" className="text-xs text-muted-foreground">
            Resolución
          </label>
          <select
            id="project-resolution"
            className={selectClass}
            value={resolutionKey}
            onChange={(event) => {
              const [width, height] = event.target.value.split("x").map(Number);
              execute(updateProjectCommand(project, { settings: { width, height } }, { label: "Cambiar resolución" }));
            }}
          >
            {!known && (
              <option value={resolutionKey}>
                {settings.width} × {settings.height}
              </option>
            )}
            {RESOLUTIONS.map((r) => (
              <option key={r.label} value={`${r.width}x${r.height}`}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-fps" className="text-xs text-muted-foreground">
              Fotogramas
            </label>
            <select
              id="project-fps"
              className={selectClass}
              value={settings.fps}
              onChange={(event) =>
                execute(
                  updateProjectCommand(project, { settings: { fps: Number(event.target.value) } }, { label: "Cambiar FPS" }),
                )
              }
            >
              {FRAME_RATES.map((fps) => (
                <option key={fps} value={fps}>
                  {fps} fps
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-bg" className="text-xs text-muted-foreground">
              Fondo
            </label>
            <input
              id="project-bg"
              type="color"
              value={settings.backgroundColor}
              onChange={(event) =>
                execute(
                  updateProjectCommand(
                    project,
                    { settings: { backgroundColor: event.target.value } },
                    { label: "Color de fondo", mergeKey: "project:background" },
                  ),
                )
              }
              onBlur={sealHistory}
              className="h-8 w-full cursor-pointer rounded-lg border border-input bg-input/30 px-1"
            />
          </div>
        </div>
      </InspectorSection>
      <p className="px-4 py-4 text-xs text-muted-foreground">
        Selecciona una pista o un clip en el timeline para editar sus propiedades.
      </p>
    </>
  );
}
