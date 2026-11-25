import {
  ArrowRight,
  Check,
  Clapperboard,
  Download,
  Gauge,
  HardDrive,
  Layers,
  type LucideIcon,
  Minus,
  MonitorPlay,
  Scissors,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: { absolute: "WebCut Studio — Editor de video en el navegador" },
  description:
    "Edita video en el navegador sin subir tus archivos: timeline multipista, keyframes, transiciones y exportación MP4. Local-first, privado y gratis durante la beta.",
};

const FEATURES: ReadonlyArray<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Layers,
    title: "Timeline multipista",
    body: "Video, superposiciones, texto y audio en pistas independientes. Arrastra, recorta, ajusta con imán y selecciona varios clips a la vez.",
  },
  {
    icon: MonitorPlay,
    title: "Preview en tiempo real",
    body: "Reproduce la composición sincronizada con el audio. Mueve, escala y rota los elementos directamente sobre la imagen.",
  },
  {
    icon: Scissors,
    title: "Edición precisa",
    body: "Divide en el cursor, elimina a izquierda o derecha, recorta el encuadre y cambia la velocidad y el volumen de cada clip.",
  },
  {
    icon: Sparkles,
    title: "Keyframes y transiciones",
    body: "Anima posición, escala, rotación y opacidad. Fundidos, barridos y deslizamientos entre clips.",
  },
  {
    icon: Download,
    title: "Exportación MP4",
    body: "Hasta 4K en H.264 con audio, generada en tu equipo con WebCodecs. Con progreso, cancelación y vista previa del resultado.",
  },
  {
    icon: Gauge,
    title: "Rápido y sin instalar",
    body: "El trabajo pesado va en segundo plano (Web Workers) para que la interfaz no se bloquee. Abre el navegador y empieza.",
  },
];

const STEPS: ReadonlyArray<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: Upload, title: "Importa", body: "Arrastra videos, audio e imágenes. Se guardan en tu navegador, no en un servidor." },
  { icon: Scissors, title: "Edita", body: "Monta en el timeline, añade textos, animaciones y transiciones. Todo se guarda solo." },
  { icon: Download, title: "Exporta", body: "Genera el MP4 en tu equipo y descárgalo. Sin colas, sin marcas de agua." },
];

type Level = "full" | "partial";
const BROWSERS: ReadonlyArray<{ name: string; edit: Level; export: Level; note: string }> = [
  { name: "Chrome / Edge", edit: "full", export: "full", note: "Recomendado. H.264 + AAC." },
  { name: "Safari 16.4+", edit: "full", export: "full", note: "En navegación privada los archivos se guardan en memoria." },
  { name: "Firefox 130+", edit: "full", export: "partial", note: "Exporta con audio Opus dentro del MP4." },
];

function LevelMark({ level, label }: { level: Level; label: string }) {
  return level === "full" ? (
    <Check className="mx-auto size-4 text-emerald-400" aria-label={`${label}: sí`} />
  ) : (
    <Minus className="mx-auto size-4 text-amber-300" aria-label={`${label}: con limitaciones`} />
  );
}

/** Ilustración del editor hecha con CSS (sin imágenes que descargar). */
function EditorMock() {
  const tracks = [
    { color: "bg-pink-600/80", clips: [[18, 34]] },
    { color: "bg-orange-600/80", clips: [[28, 48]] },
    { color: "bg-blue-600/80", clips: [[0, 46], [46, 100]] },
    { color: "bg-emerald-700/80", clips: [[0, 92]] },
  ];
  return (
    <div
      aria-hidden
      className="mx-auto mt-16 w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-panel shadow-2xl shadow-primary/5"
    >
      <div className="flex h-8 items-center gap-1.5 border-b border-border px-3">
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="size-2.5 rounded-full bg-muted" />
      </div>
      <div className="grid grid-cols-[1fr_3fr_1fr] gap-px bg-border">
        <div className="flex flex-col gap-2 bg-panel p-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-video rounded-md bg-muted/60" />
          ))}
        </div>
        <div className="flex items-center justify-center bg-background p-4">
          <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-blue-600 to-slate-900">
            <span className="text-lg font-semibold text-white drop-shadow sm:text-2xl">Tu historia</span>
            <span className="absolute top-3 right-3 h-5 w-10 rounded bg-orange-500/80" />
          </div>
        </div>
        <div className="flex flex-col gap-2 bg-panel p-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-3 rounded bg-muted/60" />
          ))}
        </div>
      </div>
      <div className="relative flex flex-col gap-1.5 border-t border-border p-3">
        <span className="absolute top-0 bottom-0 left-[38%] w-px bg-primary" />
        {tracks.map((track, i) => (
          <div key={i} className="relative h-5">
            {track.clips.map(([from, to]) => (
              <span
                key={from}
                className={`absolute inset-y-0 rounded ${track.color}`}
                style={{ left: `${from}%`, width: `calc(${to - from}% - 2px)` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
        <nav aria-label="Principal" className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Clapperboard className="size-5 text-primary" aria-hidden />
            WebCut Studio
          </Link>
          <div className="ml-auto hidden gap-5 text-sm text-muted-foreground sm:flex">
            <a href="#funciones" className="hover:text-foreground">
              Funciones
            </a>
            <a href="#privacidad" className="hover:text-foreground">
              Privacidad
            </a>
            <a href="#compatibilidad" className="hover:text-foreground">
              Compatibilidad
            </a>
          </div>
          <Link href="/projects" className={buttonVariants({ size: "sm", className: "ml-auto sm:ml-0" })}>
            Abrir el editor
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-20 pb-24 text-center">
          <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            Beta pública · gratis
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Edita video en tu navegador. Sin subir nada.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">
            WebCut Studio es un editor de video completo que funciona en tu equipo: timeline multipista, textos,
            keyframes, transiciones y exportación a MP4. Tus archivos nunca salen de tu dispositivo.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/projects" className={buttonVariants({ size: "lg", className: "px-5" })}>
              Empezar a editar
              <ArrowRight data-icon="inline-end" />
            </Link>
            <a href="#funciones" className={buttonVariants({ size: "lg", variant: "outline", className: "px-5" })}>
              Ver funciones
            </a>
          </div>
          <EditorMock />
        </section>

        <section id="funciones" aria-labelledby="funciones-titulo" className="border-t border-border/60 py-24">
          <div className="mx-auto max-w-6xl px-6">
            <h2 id="funciones-titulo" className="text-3xl font-semibold tracking-tight">
              Todo lo necesario para montar un video
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Las herramientas de un editor de escritorio, en una pestaña del navegador.
            </p>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="rounded-xl border border-border bg-panel p-6">
                  <Icon className="size-5 text-primary" aria-hidden />
                  <h3 className="mt-4 font-medium">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="pasos-titulo" className="border-t border-border/60 py-24">
          <div className="mx-auto max-w-6xl px-6">
            <h2 id="pasos-titulo" className="text-3xl font-semibold tracking-tight">
              Tres pasos
            </h2>
            <ol className="mt-12 grid gap-8 sm:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-panel text-sm font-medium tabular-nums">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="flex items-center gap-2 font-medium">
                      <Icon className="size-4 text-primary" aria-hidden /> {title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="privacidad" aria-labelledby="privacidad-titulo" className="border-t border-border/60 py-24">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-2">
            <div>
              <ShieldCheck className="size-6 text-primary" aria-hidden />
              <h2 id="privacidad-titulo" className="mt-4 text-3xl font-semibold tracking-tight">
                Privado por diseño
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                No hay servidor que reciba tus videos. La importación, la edición y la exportación ocurren en tu
                navegador, y los proyectos se guardan en el almacenamiento local de tu dispositivo.
              </p>
            </div>
            <ul className="flex flex-col gap-4 text-sm">
              {[
                ["Sin subidas", "Tus archivos se leen directamente desde tu disco."],
                ["Sin cuenta", "Abre el editor y empieza; no hace falta registrarse."],
                ["Tus datos, en tu equipo", "Los proyectos viven en el navegador. Si borras los datos del sitio, se borran también."],
              ].map(([title, body]) => (
                <li key={title} className="flex gap-3 rounded-xl border border-border bg-panel p-4">
                  <HardDrive className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="text-muted-foreground">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="compatibilidad" aria-labelledby="compat-titulo" className="border-t border-border/60 py-24">
          <div className="mx-auto max-w-6xl px-6">
            <h2 id="compat-titulo" className="text-3xl font-semibold tracking-tight">
              Compatibilidad
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              WebCut usa APIs modernas del navegador (WebCodecs, Web Workers, IndexedDB). Funciona mejor en un
              ordenador de escritorio.
            </p>
            <div className="mt-10 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-panel text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Navegador
                    </th>
                    <th scope="col" className="px-4 py-3 text-center font-medium">
                      Edición
                    </th>
                    <th scope="col" className="px-4 py-3 text-center font-medium">
                      Exportación MP4
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Notas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {BROWSERS.map((browser) => (
                    <tr key={browser.name} className="border-t border-border">
                      <th scope="row" className="px-4 py-3 font-medium">
                        {browser.name}
                      </th>
                      <td className="px-4 py-3">
                        <LevelMark level={browser.edit} label="Edición" />
                      </td>
                      <td className="px-4 py-3">
                        <LevelMark level={browser.export} label="Exportación" />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{browser.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="border-t border-border/60 py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Tu próximo video empieza aquí</h2>
          <Link href="/projects" className={buttonVariants({ size: "lg", className: "mt-8 px-5" })}>
            Abrir el editor
            <ArrowRight data-icon="inline-end" />
          </Link>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-8 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Clapperboard className="size-4 text-primary" aria-hidden /> WebCut Studio
          </span>
          <span>Versión 0.1 · beta</span>
          <span className="ml-auto">Hecho para el navegador. Tus videos se quedan contigo.</span>
        </div>
      </footer>
    </div>
  );
}
