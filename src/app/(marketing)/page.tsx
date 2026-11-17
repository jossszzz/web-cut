import { Clapperboard, HardDrive, Layers, MonitorPlay } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

const features = [
  {
    icon: HardDrive,
    title: "Local-first",
    body: "Tus archivos se procesan en tu dispositivo. Sin subidas, sin esperas.",
  },
  {
    icon: Layers,
    title: "Timeline multipista",
    body: "Video, superposiciones, texto y audio en pistas independientes.",
  },
  {
    icon: MonitorPlay,
    title: "Directo en el navegador",
    body: "Nada que instalar. Abre el editor y empieza a montar.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6">
      <header className="flex h-16 items-center justify-between">
        <span className="flex items-center gap-2 font-semibold">
          <Clapperboard className="size-5 text-primary" aria-hidden />
          WebCut Studio
        </span>
        <Link href="/projects" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Mis proyectos
        </Link>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-20 text-center">
        <span className="mb-4 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          Versión preliminar · Sprint 1
        </span>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Edita video directamente en tu navegador
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-muted-foreground">
          WebCut Studio es un editor de video web, rápido y privado. Esta versión incluye la interfaz
          del editor; la importación de medios y la exportación llegarán en las próximas fases.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/projects" className={buttonVariants({ size: "lg", className: "px-4" })}>
            Abrir el editor
          </Link>
        </div>

        <ul className="mt-20 grid w-full gap-4 text-left sm:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-xl border border-border bg-panel p-5">
              <Icon className="mb-3 size-5 text-primary" aria-hidden />
              <h2 className="font-medium">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
