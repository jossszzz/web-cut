# WebCut Studio

Editor de video web, **local-first** y **browser-based**. La especificación completa está en
[`docs/arquitectura-roadmap.md`](docs/arquitectura-roadmap.md).

> Estado: **Sprint 1** (interfaz del editor). Todavía no hay importación de medios, persistencia
> ni exportación: los proyectos viven en memoria y se pierden al recargar.

## Requisitos

- Node.js 22 o superior
- pnpm

## Comandos

```bash
pnpm install
pnpm dev              # http://localhost:3000
pnpm build && pnpm start

pnpm lint
pnpm typecheck
pnpm test             # pruebas unitarias (Vitest)
pnpm exec playwright install chromium   # solo la primera vez
pnpm test:e2e         # pruebas E2E (Playwright, compila y arranca la app)
```

## Qué incluye el Sprint 1

- Landing (`/`), lista y creación de proyectos (`/projects`) y editor (`/editor/[projectId]`).
- Layout oscuro de escritorio: header, barra de herramientas, biblioteca, preview, timeline e inspector.
- Proyecto vacío 1920 × 1080 a 30 fps, o proyecto de demostración con clips de prueba.
- Timeline en Canvas 2D: regla, playhead (clic y arrastre en la regla), zoom (botones o ⌘/Ctrl + rueda),
  scroll horizontal (rueda horizontal o ⇧ + rueda), selección de pistas y clips (⇧/⌘ para múltiple).
- Preview en Canvas: aplica posición, escala, rotación y opacidad. Los clips de video e imagen se
  dibujan como **marcadores de posición** (no hay decodificación todavía); el texto se renderiza real.
- Inspector de proyecto, pista y clip. Toda edición pasa por el sistema de comandos con deshacer/rehacer.
- Pistas: visibilidad, silencio y bloqueo (los clips de pistas bloqueadas no se pueden editar).
- Panel de texto para añadir títulos en la posición del playhead.
- Atajos: Espacio (reproducir), ⌘/Ctrl+Z, ⇧⌘/Ctrl+Z, Supr, Esc, ←/→ (frame), ⇧←/→ (1 s).

## Arquitectura

```text
src/
├── app/                 Rutas (Next.js App Router)
├── components/          ui/ (shadcn/ui + Base UI) y shared/
├── core/                Modelo, comandos, timeline. Sin React ni Next.js.
│   ├── types/time.ts        Tiempo en microsegundos enteros
│   ├── project/             Esquemas Zod, fábricas y consultas
│   ├── commands/            Comandos puros + historial undo/redo
│   └── timeline/            Geometría (tiempo ↔ px, hit testing, zoom)
├── features/
│   ├── editor/              Layout, paneles, inspector, store (Zustand), atajos
│   ├── timeline/            Renderizador Canvas + componentes
│   ├── preview/             Renderizador Canvas + reloj de reproducción
│   ├── projects/ media/ text/
└── lib/                 Utilidades de canvas, hooks, constantes
tests/
├── unit/                Vitest (core + store)
└── e2e/                 Playwright (criterios de aceptación)
```

Reglas clave: `core/` no importa React; Zustand solo guarda metadatos (nunca `File`/`Blob`); las
ediciones pasan por comandos; los renderizadores de canvas son funciones independientes de React.
