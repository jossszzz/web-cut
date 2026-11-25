"use client";

import { AlertTriangle, CheckCircle2, Download, Film, Loader2, RotateCcw, XCircle } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { isBlocking, planExport, type ExportIssue } from "@/core/export/plan";
import {
  availableResolutions,
  computeOutputSize,
  defaultExportSettings,
  estimateFileSize,
  EXPORT_FPS,
  EXPORT_QUALITIES,
  exportFileName,
  type ExportSettings,
} from "@/core/export/settings";
import { formatBytes } from "@/core/media/validation";
import { getProjectDuration } from "@/core/project/queries";
import type { Project } from "@/core/project/schema";
import { formatDuration } from "@/core/types/time";
import { selectActiveProject, useEditorStore } from "@/features/editor/store/editorStore";
import { useMediaStore } from "@/features/media/store/mediaStore";

import { cancelExport, detectCapabilities, downloadExport, resetExport, startExport } from "../exportService";
import { estimateRemaining, progressFraction, useExportStore } from "../store/exportStore";
import type { ExportCapabilities, VideoCodecId } from "../types";

const CODEC_LABELS: Record<VideoCodecId | "aac" | "opus", string> = {
  avc: "H.264",
  hevc: "H.265",
  vp9: "VP9",
  av1: "AV1",
  aac: "AAC",
  opus: "Opus",
};

const PHASE_LABELS = { preparing: "Preparando medios…", rendering: "Renderizando", finalizing: "Finalizando archivo…" };

function formatMs(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-lg border border-input bg-input/30 px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Notice({ tone, children }: { tone: "warning" | "error"; children: ReactNode }) {
  const Icon = tone === "error" ? XCircle : AlertTriangle;
  return (
    <li
      className={
        tone === "error"
          ? "flex gap-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive"
          : "flex gap-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-300"
      }
    >
      <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

function issueText(issue: ExportIssue): string {
  switch (issue.kind) {
    case "empty":
      return "El proyecto está vacío: añade clips al timeline para exportar.";
    case "missing-media":
      return `Falta el medio de ${issue.clipNames.map((n) => `«${n}»`).join(", ")}: se exportará como marcador.`;
    case "placeholders":
      return `${issue.clipNames.length === 1 ? "El clip" : "Los clips"} ${issue.clipNames.map((n) => `«${n}»`).join(", ")} no ${issue.clipNames.length === 1 ? "tiene" : "tienen"} medio: saldrán como marcadores de prueba.`;
  }
}

function SettingsForm({
  project,
  settings,
  onChange,
  capabilities,
}: {
  project: Project;
  settings: ExportSettings;
  onChange: (settings: ExportSettings) => void;
  capabilities: ExportCapabilities | null;
}) {
  const assets = useMediaStore((state) => state.assets);
  const plan = useMemo(() => planExport(project, assets), [project, assets]);
  const { width, height } = computeOutputSize(project, settings.resolution);
  const hasAudio = plan.audioClips.length > 0;
  const size = estimateFileSize(project, settings, hasAudio && capabilities?.audioCodec !== null);
  const fpsOptions = [...new Set([project.settings.fps, ...EXPORT_FPS])].sort((a, b) => a - b);

  const notices: Array<{ tone: "warning" | "error"; text: string }> = plan.issues.map((issue) => ({
    tone: isBlocking(issue) ? "error" : "warning",
    text: issueText(issue),
  }));
  if (capabilities && !capabilities.webCodecs) {
    notices.push({
      tone: "error",
      text: "Este navegador no admite WebCodecs, necesario para exportar. Usa una versión reciente de Chrome, Edge o Safari.",
    });
  } else if (capabilities && !capabilities.videoCodec) {
    notices.push({
      tone: "error",
      text: `El navegador no puede codificar video a ${width}×${height}. Prueba con una resolución menor.`,
    });
  } else if (capabilities?.videoCodec && capabilities.videoCodec !== "avc") {
    notices.push({
      tone: "warning",
      text: `H.264 no está disponible: se usará ${CODEC_LABELS[capabilities.videoCodec]}. Algunos reproductores (p. ej. QuickTime) podrían no abrirlo.`,
    });
  }
  if (capabilities?.webCodecs && hasAudio && !capabilities.audioCodec) {
    notices.push({ tone: "warning", text: "El navegador no puede codificar audio: el video se exportará sin sonido." });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <SelectField
          label="Resolución"
          value={settings.resolution}
          onChange={(value) => onChange({ ...settings, resolution: value as ExportSettings["resolution"] })}
          options={availableResolutions(project).map((r) => {
            const out = computeOutputSize(project, r.value);
            return { value: r.value, label: r.value === "project" ? `${out.width}×${out.height}` : r.label };
          })}
        />
        <SelectField
          label="Fotogramas/s"
          value={String(settings.fps)}
          onChange={(value) => onChange({ ...settings, fps: Number(value) })}
          options={fpsOptions.map((fps) => ({ value: String(fps), label: `${fps} fps` }))}
        />
        <SelectField
          label="Calidad"
          value={settings.quality}
          onChange={(value) => onChange({ ...settings, quality: value as ExportSettings["quality"] })}
          options={EXPORT_QUALITIES}
        />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-muted/40 p-3 text-xs">
        <dt className="text-muted-foreground">Archivo</dt>
        <dd className="truncate text-right font-mono">{exportFileName(project.name)}</dd>
        <dt className="text-muted-foreground">Formato</dt>
        <dd className="text-right" data-testid="export-format">
          {capabilities === null ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden /> Comprobando…
            </span>
          ) : capabilities.videoCodec ? (
            `MP4 · ${CODEC_LABELS[capabilities.videoCodec]}${hasAudio && capabilities.audioCodec ? ` + ${CODEC_LABELS[capabilities.audioCodec]}` : ""}`
          ) : (
            "No disponible"
          )}
        </dd>
        <dt className="text-muted-foreground">Duración</dt>
        <dd className="text-right tabular-nums">{formatDuration(getProjectDuration(project))}</dd>
        <dt className="text-muted-foreground">Tamaño estimado</dt>
        <dd className="text-right tabular-nums" title="Máximo aproximado: con contenido sencillo el archivo es bastante menor">
          hasta ≈ {formatBytes(size)}
        </dd>
      </dl>

      {notices.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Avisos de exportación">
          {notices.map((notice) => (
            <Notice key={notice.text} tone={notice.tone}>
              {notice.text}
            </Notice>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProgressView() {
  const progress = useExportStore((state) => state.progress);
  const startedAt = useExportStore((state) => state.startedAt);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const fraction = progressFraction(progress);
  const remaining = estimateRemaining(progress, startedAt, now);
  const percent = Math.floor(fraction * 100);

  return (
    <div className="flex flex-col gap-3 py-2" aria-live="polite">
      <div className="flex items-baseline justify-between text-sm">
        <span>{progress ? PHASE_LABELS[progress.phase] : PHASE_LABELS.preparing}</span>
        <span className="font-mono tabular-nums" data-testid="export-percent">
          {percent}%
        </span>
      </div>
      <Progress value={percent} aria-label="Progreso de la exportación" />
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{progress && progress.totalFrames > 0 ? `Frame ${progress.frame} de ${progress.totalFrames}` : " "}</span>
        <span>{remaining !== null ? (remaining < 1500 ? "Casi listo" : `Quedan unos ${formatMs(remaining)}`) : startedAt ? `${formatMs(now - startedAt)}` : ""}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        La exportación se hace en este dispositivo. Puedes seguir viendo el editor, pero no cierres la pestaña.
      </p>
    </div>
  );
}

function ResultView() {
  const result = useExportStore((state) => state.result);
  if (!result) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm text-emerald-400">
        <CheckCircle2 className="size-4" aria-hidden /> Exportación completada en {formatMs(result.elapsed)}
      </p>
      <video
        src={result.url}
        controls
        playsInline
        className="aspect-video w-full rounded-lg bg-black"
        data-testid="export-result-video"
      />
      <p className="text-xs text-muted-foreground">
        <span className="font-mono text-foreground">{result.fileName}</span> · {formatBytes(result.size)}
      </p>
    </div>
  );
}

function ErrorView({ onSelectClip }: { onSelectClip: (clipId: string) => void }) {
  const error = useExportStore((state) => state.error);
  const status = useExportStore((state) => state.status);
  if (!error) return null;
  return (
    <div role={status === "error" ? "alert" : "status"} className="flex flex-col gap-2">
      <p className="flex items-start gap-2 text-sm">
        {status === "canceled" ? (
          <XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        )}
        {error.message}
      </p>
      {error.clipId && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => onSelectClip(error.clipId!)}>
          Ir al clip
        </Button>
      )}
    </div>
  );
}

/** Contenido del diálogo de exportación (se carga al abrirlo). */
export default function ExportPanel({ onClose }: { onClose: () => void }) {
  const project = useEditorStore(selectActiveProject);
  const selectClip = useEditorStore((state) => state.selectClip);
  const status = useExportStore((state) => state.status);
  const [settings, setSettings] = useState<ExportSettings | null>(null);
  const [detected, setDetected] = useState<{ key: string; capabilities: ExportCapabilities } | null>(null);

  const running = status === "running";
  const effective = project ? (settings ?? defaultExportSettings(project)) : null;
  // Las capacidades dependen solo de lo que afecta a los códecs.
  const capabilityKey =
    project && effective
      ? `${project.settings.width}x${project.settings.height}:${effective.resolution}:${effective.fps}:${effective.quality}`
      : "";
  const capabilities = detected?.key === capabilityKey ? detected.capabilities : null;

  useEffect(() => {
    if (!project || !effective || status !== "idle") return;
    let active = true;
    void detectCapabilities(project, effective).then((caps) => {
      if (active) setDetected({ key: capabilityKey, capabilities: caps });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, capabilityKey]);

  if (!project || !effective) return null;
  const plan = planExport(project, useMediaStore.getState().assets);
  const canExport = Boolean(capabilities?.videoCodec) && !plan.issues.some(isBlocking);

  return (
    <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="size-4 text-primary" aria-hidden /> Exportar video
          </DialogTitle>
          <DialogDescription>Se genera un MP4 en tu navegador; nada se sube a ningún servidor.</DialogDescription>
        </DialogHeader>

        {status === "idle" && (
          <SettingsForm project={project} settings={effective} onChange={setSettings} capabilities={capabilities} />
        )}
        {running && <ProgressView />}
        {status === "done" && <ResultView />}
        {(status === "error" || status === "canceled") && (
          <ErrorView
            onSelectClip={(clipId) => {
              selectClip(clipId);
              onClose();
            }}
          />
        )}

        <DialogFooter>
          {status === "idle" && (
            <Button
              disabled={!canExport}
              onClick={() => capabilities && void startExport(project, useMediaStore.getState().assets, effective, capabilities)}
            >
              <Download data-icon="inline-start" />
              Exportar MP4
            </Button>
          )}
          {running && (
            <Button variant="outline" onClick={cancelExport}>
              Cancelar exportación
            </Button>
          )}
          {status === "done" && (
            <>
              <Button variant="outline" onClick={resetExport}>
                <RotateCcw data-icon="inline-start" />
                Exportar de nuevo
              </Button>
              <Button onClick={downloadExport}>
                <Download data-icon="inline-start" />
                Descargar
              </Button>
            </>
          )}
          {(status === "error" || status === "canceled") && (
            <Button onClick={resetExport}>
              <RotateCcw data-icon="inline-start" />
              {status === "error" ? "Volver a intentarlo" : "Volver a los ajustes"}
            </Button>
          )}
        </DialogFooter>
    </>
  );
}
