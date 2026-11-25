"use client";

import {
  AlertCircle,
  Clapperboard,
  Film,
  HardDrive,
  LayoutTemplate,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "cn";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { BrowserSupportNotice } from "@/components/shared/BrowserSupportNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBytes } from "@/core/media/validation";
import { getProjectDuration } from "@/core/project/queries";
import type { Project } from "@/core/project/schema";
import { formatDuration } from "@/core/types/time";
import { useEditorStore, type ProjectTemplate } from "@/features/editor/store/editorStore";
import { estimateStorage, type StorageEstimate } from "@/infrastructure/browser/storageQuota";
import { useHydrated } from "@/lib/hooks/useHydrated";

import { createProject, deleteProject, loadAllProjects } from "../persistence/projectPersistence";

const TEMPLATES: ReadonlyArray<{ id: ProjectTemplate; title: string; body: string; icon: typeof Film }> = [
  {
    id: "empty",
    title: "Proyecto vacío",
    body: "1920 × 1080 · 30 fps, con pistas por defecto.",
    icon: LayoutTemplate,
  },
  { id: "demo", title: "Demostración", body: "Incluye clips de prueba para explorar el editor.", icon: Film },
];

const dateFormat = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function StorageInfo({ estimate }: { estimate: StorageEstimate | null }) {
  if (!estimate || estimate.quota === 0) return null;
  const percent = Math.min(100, (estimate.usage / estimate.quota) * 100);
  return (
    <div className="mt-10 rounded-xl border border-border bg-panel p-4 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <HardDrive className="size-4 text-primary" aria-hidden />
        Almacenamiento local
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full bg-primary" style={{ width: `${Math.max(percent, 0.5)}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {formatBytes(estimate.usage)} usados de {formatBytes(estimate.quota)} disponibles para este sitio.{" "}
        {estimate.persisted
          ? "El navegador conservará estos datos."
          : "El navegador podría borrar estos datos si se queda sin espacio; se pedirá permiso de almacenamiento persistente al importar."}
      </p>
    </div>
  );
}

export function ProjectsScreen() {
  const router = useRouter();
  const projects = useEditorStore((state) => state.projects);
  const loaded = useEditorStore((state) => state.projectsLoaded);
  const hydrated = useHydrated();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<ProjectTemplate>("empty");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);

  useEffect(() => {
    loadAllProjects().catch((e: unknown) => setError(errorText(e, "No se pudieron cargar los proyectos.")));
    estimateStorage().then(setEstimate);
  }, []);

  const list = Object.values(projects).sort((a, b) => b.updatedAt - a.updatedAt);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const project = await createProject({ name, template });
      router.push(`/editor/${project.id}`);
    } catch (e) {
      setError(errorText(e, "No se pudo crear el proyecto."));
      setCreating(false);
    }
  };

  const onDelete = async (project: Project) => {
    if (!window.confirm(`¿Eliminar "${project.name}" y todos sus medios? Esta acción no se puede deshacer.`))
      return;
    try {
      await deleteProject(project.id);
      estimateStorage().then(setEstimate);
    } catch (e) {
      setError(errorText(e, "No se pudo eliminar el proyecto."));
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 pb-16">
      <header className="flex h-16 items-center">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Clapperboard className="size-5 text-primary" aria-hidden />
          WebCut Studio
        </Link>
      </header>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Proyectos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Los proyectos y medios se guardan en este navegador (IndexedDB). No se suben a ningún servidor.
      </p>
      <div className="mt-4 empty:hidden">
        <BrowserSupportNotice />
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-8 rounded-xl border border-border bg-panel p-5">
        <h2 className="font-medium">Nuevo proyecto</h2>
        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="project-name">Nombre</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Proyecto sin título"
            disabled={!hydrated}
            maxLength={80}
            className="max-w-sm"
          />
        </div>
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium">Plantilla</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {TEMPLATES.map(({ id, title, body, icon: Icon }) => (
              <label
                key={id}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  template === id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-foreground/20",
                )}
              >
                <input
                  type="radio"
                  name="template"
                  value={id}
                  checked={template === id}
                  disabled={!hydrated}
                  onChange={() => setTemplate(id)}
                  className="sr-only"
                />
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-xs text-muted-foreground">{body}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" className="mt-5" disabled={creating || !hydrated}>
          {creating ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Plus data-icon="inline-start" />
          )}
          Crear proyecto
        </Button>
      </form>

      <section className="mt-10" aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="font-medium">
          Mis proyectos
        </h2>
        {!loaded ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Cargando proyectos…
          </p>
        ) : list.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Todavía no hay proyectos.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {list.map((project) => (
              <li
                key={project.id}
                className="flex items-center gap-2 pr-2 transition-colors hover:bg-accent/50"
              >
                <Link
                  href={`/editor/${project.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{project.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      Editado {dateFormat.format(project.updatedAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {project.settings.width} × {project.settings.height} ·{" "}
                    {formatDuration(getProjectDuration(project))}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => onDelete(project)}
                  aria-label={`Eliminar ${project.name}`}
                  className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <StorageInfo estimate={estimate} />
    </main>
  );
}
