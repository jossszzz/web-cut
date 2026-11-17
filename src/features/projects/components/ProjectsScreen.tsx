"use client";

import { Clapperboard, Film, LayoutTemplate, Plus } from "lucide-react";
import { cn } from "cn";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getProjectDuration } from "@/core/project/queries";
import { formatDuration } from "@/core/types/time";
import { useEditorStore, type ProjectTemplate } from "@/features/editor/store/editorStore";

const TEMPLATES: ReadonlyArray<{ id: ProjectTemplate; title: string; body: string; icon: typeof Film }> = [
  { id: "empty", title: "Proyecto vacío", body: "1920 × 1080 · 30 fps, con pistas por defecto.", icon: LayoutTemplate },
  { id: "demo", title: "Demostración", body: "Incluye clips de prueba para explorar el editor.", icon: Film },
];

export function ProjectsScreen() {
  const router = useRouter();
  const projects = useEditorStore((state) => state.projects);
  const createProject = useEditorStore((state) => state.createProject);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<ProjectTemplate>("empty");

  const list = Object.values(projects).sort((a, b) => b.updatedAt - a.updatedAt);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const project = createProject({ name, template });
    router.push(`/editor/${project.id}`);
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
        En esta versión los proyectos se guardan solo en memoria y se pierden al recargar. La persistencia
        local (IndexedDB) llega en la Fase 2.
      </p>

      <form onSubmit={onSubmit} className="mt-8 rounded-xl border border-border bg-panel p-5">
        <h2 className="font-medium">Nuevo proyecto</h2>
        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="project-name">Nombre</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Proyecto sin título"
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
                  template === id ? "border-primary bg-primary/5" : "border-border hover:border-foreground/20",
                )}
              >
                <input
                  type="radio"
                  name="template"
                  value={id}
                  checked={template === id}
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
        <Button type="submit" className="mt-5">
          <Plus data-icon="inline-start" />
          Crear proyecto
        </Button>
      </form>

      <section className="mt-10" aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="font-medium">
          Proyectos de esta sesión
        </h2>
        {list.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Todavía no hay proyectos.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {list.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/editor/${project.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent/50"
                >
                  <span className="truncate text-sm font-medium">{project.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {project.settings.width} × {project.settings.height} · {formatDuration(getProjectDuration(project))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
