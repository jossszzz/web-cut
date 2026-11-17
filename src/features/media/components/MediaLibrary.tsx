"use client";

import { AlertCircle, Loader2, Upload, X } from "lucide-react";
import { cn } from "cn";
import { useMemo, useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { ACCEPT_ATTRIBUTE, formatBytes } from "@/core/media/validation";
import { useEditorStore } from "@/features/editor/store/editorStore";

import { cancelImport, importFiles } from "../import/importService";
import { sortAssets, useMediaStore, type ImportJob } from "../store/mediaStore";
import { AssetCard } from "./AssetCard";

const STAGE_LABEL: Record<ImportJob["stage"], string> = {
  queued: "En cola",
  validating: "Validando…",
  reading: "Leyendo metadatos…",
  saving: "Guardando…",
};

function ImportJobRow({ job }: { job: ImportJob }) {
  const failed = job.error !== undefined;
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs",
        failed ? "border-destructive/40 bg-destructive/10" : "border-border bg-panel-raised",
      )}
    >
      {failed ? (
        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
      ) : (
        <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" title={job.fileName}>
          {job.fileName}
        </p>
        <p className={failed ? "text-destructive" : "text-muted-foreground"}>
          {failed ? job.error : `${STAGE_LABEL[job.stage]} · ${formatBytes(job.size)}`}
        </p>
      </div>
      <button
        type="button"
        onClick={() => cancelImport(job.id)}
        aria-label={failed ? `Descartar error de ${job.fileName}` : `Cancelar importación de ${job.fileName}`}
        className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

/** Biblioteca multimedia del proyecto: importación, cola y assets guardados. */
export function MediaLibrary() {
  const projectId = useEditorStore((state) => state.activeProjectId);
  const assetMap = useMediaStore((state) => state.assets);
  const assets = useMemo(() => sortAssets(assetMap), [assetMap]);
  const status = useMediaStore((state) => state.status);
  const jobs = useMediaStore((state) => state.importJobs);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const startImport = (files: FileList | null) => {
    if (!projectId || !files || files.length === 0) return;
    setNotice(null);
    importFiles(Array.from(files), projectId);
  };

  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

  return (
    <div
      className={cn(
        "flex min-h-full flex-col gap-3 rounded-lg transition-colors",
        dragging && "bg-primary/5 outline-2 outline-dashed outline-primary/60",
      )}
      onDragEnter={(e) => hasFiles(e) && setDragging(true)}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        startImport(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-label="Seleccionar archivos para importar"
        data-testid="media-file-input"
        onChange={(e) => {
          startImport(e.target.files);
          e.target.value = "";
        }}
      />
      <Button variant="secondary" className="w-full" onClick={() => inputRef.current?.click()} disabled={!projectId}>
        <Upload data-icon="inline-start" />
        Importar medios
      </Button>

      {jobs.length > 0 && (
        <ul aria-label="Importaciones" aria-live="polite" className="flex flex-col gap-1.5">
          {jobs.map((job) => (
            <ImportJobRow key={job.id} job={job} />
          ))}
        </ul>
      )}

      {notice && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="flex-1">{notice}</span>
          <button type="button" aria-label="Cerrar aviso" onClick={() => setNotice(null)}>
            <X className="size-3.5" />
          </button>
        </p>
      )}

      {status === "loading" && <p className="text-xs text-muted-foreground">Cargando biblioteca…</p>}
      {status === "error" && (
        <p className="text-xs text-destructive">No se pudo cargar la biblioteca desde el almacenamiento local.</p>
      )}

      {status === "ready" && assets.length === 0 && jobs.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <Upload className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">Arrastra archivos aquí</p>
          <p className="text-xs text-muted-foreground">
            Video (MP4, WebM, MOV), audio (MP3, WAV, OGG, M4A) o imagen (PNG, JPG, WebP). Se guardan solo en este
            dispositivo.
          </p>
        </div>
      )}

      {assets.length > 0 && (
        <>
          <ul aria-label="Medios importados" className="grid grid-cols-2 gap-2">
            {assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} onError={setNotice} />
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            Arrastra un medio al timeline o pulsa <span className="font-medium text-foreground">+</span> para añadirlo
            en el cursor.
          </p>
        </>
      )}
    </div>
  );
}
