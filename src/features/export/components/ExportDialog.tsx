"use client";

import { Download, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { selectActiveProject, useEditorStore } from "@/features/editor/store/editorStore";

import { resetExport } from "../exportService";
import { useExportStore } from "../store/exportStore";

/** El formulario, el progreso y el resultado se cargan solo al abrir el diálogo. */
const ExportPanel = dynamic(() => import("./ExportPanel"), {
  ssr: false,
  loading: () => (
    <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden /> Cargando…
    </p>
  ),
});

export function ExportDialog() {
  const projectId = useEditorStore((state) => selectActiveProject(state)?.id);
  const status = useExportStore((state) => state.status);
  const exportProjectId = useExportStore((state) => state.projectId);
  const [open, setOpen] = useState(false);
  const running = status === "running";

  // Un resultado de otro proyecto no se muestra.
  useEffect(() => {
    if (projectId && exportProjectId && exportProjectId !== projectId && !running) resetExport();
  }, [projectId, exportProjectId, running]);

  if (!projectId) return null;

  const close = () => {
    setOpen(false);
    if (status !== "running" && status !== "idle") resetExport();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else if (!running) close();
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        {running ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Download data-icon="inline-start" />}
        Exportar
      </DialogTrigger>
      <DialogContent showCloseButton={!running} className="sm:max-w-md">
        {open && <ExportPanel onClose={close} />}
      </DialogContent>
    </Dialog>
  );
}
