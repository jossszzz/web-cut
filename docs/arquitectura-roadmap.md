# WebCut Studio — Arquitectura técnica y roadmap

## 1. Visión del producto

WebCut Studio será un editor de video web inspirado en CapCut, diseñado como un producto SaaS browser-first.

La primera versión funcionará localmente en el navegador, sin backend propio:

- Los archivos multimedia se procesan en el dispositivo.
- Los proyectos se guardan localmente.
- La edición básica funciona sin conexión después de cargar la aplicación.
- La exportación se realiza en el navegador.
- La arquitectura queda preparada para incorporar cuentas, almacenamiento cloud y suscripciones posteriormente.

**Decisión arquitectónica:** Local-first + Browser-based.

> Browser-only no significa ejecutar todo en el hilo principal. Las tareas multimedia pesadas deben ejecutarse en Web Workers y aprovechar APIs nativas cuando estén disponibles.

## 2. Decisiones técnicas

| Área | Decisión |
|---|---|
| Arquitectura inicial | Browser-only |
| Modelo de datos | Local-first |
| Objetivo comercial | SaaS |
| Backend inicial | Ninguno |
| Preview | HTMLVideoElement + Canvas |
| Timeline | Canvas 2D |
| Estado | Zustand |
| Persistencia | IndexedDB mediante Dexie |
| Procesamiento multimedia | WebCodecs + Mediabunny |
| Fallback multimedia | FFmpeg WebAssembly |
| Audio | Web Audio API / AudioWorklet |
| Workers | Dedicated Web Workers |
| Framework | Next.js + React |
| Lenguaje | TypeScript |

## 3. Stack tecnológico definitivo

| Capa | Tecnología | Responsabilidad |
|---|---|---|
| Framework | Next.js (App Router) | Aplicación y navegación |
| UI | React | Componentes |
| Lenguaje | TypeScript | Tipado estático |
| Estilos | Tailwind CSS | Diseño |
| Componentes | shadcn/ui | Componentes accesibles |
| Estado | Zustand | Estado del editor |
| Drag & Drop | dnd-kit | Interacciones |
| Timeline | Canvas 2D | Renderizado de pistas y clips |
| Preview | HTMLVideoElement / Canvas | Previsualización |
| Audio | Web Audio API | Mezcla y efectos |
| Codec | WebCodecs | Codificación y decodificación cuando esté soportado |
| Demux/mux | Mediabunny | Lectura y escritura multimedia |
| Fallback | FFmpeg WASM | Operaciones multimedia alternativas |
| Persistencia | IndexedDB + Dexie | Proyectos y archivos locales |
| Validación | Zod | Validación de datos |
| Testing | Vitest + Playwright | Pruebas unitarias y E2E |

### Decisiones sobre el motor multimedia

No utilizar Remotion como núcleo obligatorio. El editor tendrá un motor propio, independiente de React, que controle:

- Timeline multipista.
- Posicionamiento y duración de clips.
- Keyframes.
- Sincronización de audio y video.
- Transiciones.
- Composición de escenas.
- Renderizado y exportación.

WebCodecs no es un motor completo de exportación. Se necesita una solución de muxing para combinar audio y video. Se propone Mediabunny para demuxing/muxing y operaciones multimedia.

FFmpeg WASM se cargará bajo demanda, no durante el inicio de la aplicación. Comenzar con la variante de un hilo; el modo multihilo requiere aislamiento cross-origin y `SharedArrayBuffer`.

La disponibilidad de WebCodecs y los codecs compatibles varían por navegador y dispositivo. Detectar soporte antes de habilitar funciones.

## 4. Arquitectura general

```text
Presentation Layer
  React · Next.js · Tailwind · shadcn/ui
          |
          v
Editor Application Layer
  Editor · Media Library · Timeline · Inspector · Playback
          |
          v
  +-------------------+--------------------+
  |                   |                    |
State Manager     Command System      Project Engine
Zustand           Undo / Redo          Timeline / Clips
  |                   |                    |
  +-------------------+--------------------+
                      |
                      v
                 Media Engine
          Preview · Composition · Audio · Export
                      |
          +-----------+-----------+
          |           |           |
       WebCodecs    Canvas     Web Audio
          |           |           |
          +-----------+-----------+
                      |
                      v
             Browser Hardware
               CPU · GPU · RAM
```

### Responsabilidades por capa

- **Presentation:** componentes visuales, navegación y controles.
- **Editor application:** coordina biblioteca, timeline, inspector y playback.
- **Core:** modelo de proyecto, timeline, comandos y reglas de negocio. No importa React ni Next.js.
- **Media engine:** preview, composición, audio, codecs y exportación.
- **Infrastructure:** APIs del navegador, IndexedDB y adaptadores de almacenamiento.
- **Workers:** metadatos, thumbnails, decodificación y exportación.

### Ejecución de tareas

| Proceso | Ejecución |
|---|---|
| UI | Main Thread |
| Interacción del timeline | Main Thread + Canvas |
| Lectura de metadatos | Web Worker |
| Generación de thumbnails | Web Worker |
| Decodificación de video | Web Worker cuando sea viable |
| Exportación | Web Worker |
| Audio | Web Audio API / AudioWorklet |
| Persistencia | IndexedDB |

No bloquear el hilo principal con procesamiento multimedia.

## 5. Estructura de carpetas

```text
webcut-studio/
├── public/
│   ├── icons/
│   ├── fonts/
│   └── assets/
│
├── src/
│   ├── app/
│   │   ├── (marketing)/
│   │   │   ├── page.tsx
│   │   │   ├── pricing/
│   │   │   └── about/
│   │   ├── editor/
│   │   │   └── [projectId]/
│   │   │       └── page.tsx
│   │   ├── projects/
│   │   │   └── page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   └── shared/
│   │
│   ├── features/
│   │   ├── editor/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── store/
│   │   │   └── types/
│   │   ├── timeline/
│   │   │   ├── components/
│   │   │   ├── engine/
│   │   │   ├── commands/
│   │   │   └── types/
│   │   ├── media/
│   │   │   ├── components/
│   │   │   ├── import/
│   │   │   ├── metadata/
│   │   │   └── thumbnails/
│   │   ├── preview/
│   │   │   ├── components/
│   │   │   ├── renderer/
│   │   │   └── playback/
│   │   ├── audio/
│   │   │   ├── engine/
│   │   │   └── components/
│   │   ├── effects/
│   │   ├── text/
│   │   └── export/
│   │
│   ├── core/
│   │   ├── project/
│   │   ├── timeline/
│   │   ├── commands/
│   │   ├── events/
│   │   ├── media/
│   │   └── types/
│   │
│   ├── workers/
│   │   ├── media.worker.ts
│   │   ├── thumbnail.worker.ts
│   │   └── export.worker.ts
│   │
│   ├── infrastructure/
│   │   ├── database/
│   │   ├── storage/
│   │   ├── codecs/
│   │   └── browser/
│   │
│   ├── lib/
│   │   ├── utils/
│   │   └── constants/
│   │
│   └── styles/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── package.json
├── tsconfig.json
├── next.config.ts
└── README.md
```

### Reglas de dependencias

1. `core/` no debe importar React, Next.js ni componentes visuales.
2. `features/` puede utilizar `core/` y servicios de `infrastructure/` mediante interfaces.
3. Los componentes React no deben implementar directamente la lógica multimedia.
4. Los workers deben recibir mensajes serializables o transferibles; evitar copiar grandes buffers innecesariamente.
5. Los archivos binarios se guardan en IndexedDB, no en Zustand.
6. Mantener los adaptadores del navegador detrás de interfaces cuando sea razonable.

## 6. Dependencias

Usar pnpm como gestor de paquetes.

### Principales

- `next`
- `react`
- `react-dom`
- `zustand`
- `tailwindcss`
- `dexie`
- `zod`
- `@dnd-kit/core`
- `@dnd-kit/sortable`
- `@dnd-kit/utilities`
- `lucide-react`
- `clsx`
- `tailwind-merge`

### Multimedia

- `mediabunny`
- `@ffmpeg/ffmpeg`
- `@ffmpeg/util`
- `comlink`

### Desarrollo y testing

- `vitest`
- `@playwright/test`
- `eslint`
- `prettier`
- `typescript`

### Comandos de instalación

```bash
pnpm create next-app@latest webcut-studio
cd webcut-studio

pnpm add zustand dexie zod

pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

pnpm add mediabunny @ffmpeg/ffmpeg @ffmpeg/util

pnpm add comlink

pnpm add lucide-react clsx tailwind-merge

pnpm add -D vitest @playwright/test prettier

pnpm dlx shadcn@latest init
```

Al crear el proyecto, seleccionar TypeScript, Tailwind, App Router y alias `@/*`. Revisar las instrucciones actuales de instalación de cada librería y compatibilidad entre versiones antes de fijar dependencias.

## 7. Modelo de datos

El proyecto representa una composición temporal, no solo una colección de archivos.

```typescript
export interface Project {
  id: string;
  name: string;

  settings: {
    width: number;
    height: number;
    fps: number;
    backgroundColor: string;
  };

  duration: number;
  tracks: Track[];

  createdAt: number;
  updatedAt: number;
}

export interface Track {
  id: string;
  type: "video" | "audio" | "overlay";
  name: string;
  muted: boolean;
  locked: boolean;
  visible: boolean;
  clips: Clip[];
}

export interface Clip {
  id: string;
  type: "video" | "audio" | "image" | "text";
  assetId?: string;

  // Posición del clip en la línea de tiempo.
  start: number;

  // Duración visible en la línea de tiempo.
  duration: number;

  // Punto inicial dentro del archivo fuente.
  sourceStart: number;

  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    opacity: number;
  };

  effects: Effect[];
}

export interface Effect {
  id: string;
  type: string;
  enabled: boolean;
  parameters: Record<string, number | string | boolean>;
}

export interface MediaAsset {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  duration?: number;
  width?: number;
  height?: number;
  blobId: string;
}
```

### Tiempo y precisión

Internamente utilizar unidades enteras de tiempo (por ejemplo, microsegundos o ticks) y funciones de conversión a segundos. Evitar depender exclusivamente de decimales para sincronización.

Ejemplo: un clip comienza en el segundo 10 del proyecto, utiliza el tramo 5–20 del archivo original y dura 15 segundos:

```typescript
{
  start: 10,
  duration: 15,
  sourceStart: 5
}
```

Mantener los recursos multimedia separados de los proyectos. Los proyectos referencian los assets por ID para evitar duplicar archivos.

## 8. Contratos de infraestructura

Preparar interfaces para que la persistencia local pueda sustituirse por servicios remotos en el futuro.

```typescript
export interface ProjectRepository {
  save(project: Project): Promise<void>;
  getById(id: string): Promise<Project | null>;
  getAll(): Promise<Project[]>;
  delete(id: string): Promise<void>;
}

export interface AssetStorage {
  save(file: Blob): Promise<string>;
  get(id: string): Promise<Blob | null>;
  delete(id: string): Promise<void>;
}

export interface ExportOptions {
  format: "mp4";
  width: number;
  height: number;
  fps: number;
  videoBitrate?: number;
}

export interface ExportService {
  export(
    project: Project,
    options: ExportOptions
  ): Promise<Blob>;
}
```

Implementar inicialmente `LocalProjectRepository`, `LocalAssetStorage` y `BrowserExportService`. Más adelante agregar adaptadores cloud sin cambiar los componentes del editor.

## 9. Roadmap de 16 semanas

Estimación orientativa para un desarrollador individual. El calendario dependerá de las pruebas de compatibilidad y del alcance final.

### Fase 1 — Fundamentos e interfaz (semanas 1–2)

- Crear proyecto Next.js.
- Configurar Tailwind y shadcn/ui.
- Crear layout del editor.
- Panel de medios.
- Preview central.
- Timeline inferior.
- Inspector lateral.
- Barra de herramientas.
- Diseño enfocado en escritorio.

**Entregable:** interfaz navegable y proyecto base.

### Fase 2 — Importación y almacenamiento (semanas 3–4)

- Importar videos, imágenes y audios.
- Validar tipos y tamaños.
- Leer metadatos.
- Crear miniaturas.
- Guardar archivos en IndexedDB.
- Crear, guardar y recuperar proyectos.
- Gestionar errores de cuota y almacenamiento.

**Entregable:** biblioteca multimedia persistente localmente.

### Fase 3 — Timeline multipista (semanas 5–7)

- Crear y eliminar pistas.
- Crear y mover clips.
- Redimensionar clips.
- Selección individual y múltiple.
- Zoom y scroll.
- Playhead.
- Snapping.
- Reordenamiento de pistas.
- Comandos undo/redo.
- Pruebas de operaciones temporales.

**Entregable:** timeline funcional.

### Fase 4 — Preview y reproducción (semanas 8–9)

- Sincronización temporal.
- Reproducción de video.
- Cambio entre clips.
- Imágenes y texto.
- Control de FPS.
- Sincronización de audio.
- Gestión de seeking y buffering.

**Entregable:** preview de la composición.

### Fase 5 — Herramientas de edición (semanas 10–11)

- Split.
- Trim.
- Crop.
- Resize.
- Rotación.
- Opacidad.
- Control de velocidad.
- Volumen.
- Transiciones básicas.
- Primeros keyframes.

**Entregable:** edición funcional de una composición.

### Fase 6 — Exportación (semanas 12–14)

- Detección de capacidades WebCodecs.
- Composición frame por frame.
- Procesamiento de audio.
- Codificación.
- Multiplexado MP4 mediante Mediabunny.
- Barra de progreso.
- Cancelación.
- Errores recuperables.
- Pruebas de calidad de salida.

**Entregable:** exportación MP4 real.

### Fase 7 — Optimización y lanzamiento (semanas 15–16)

- Pruebas de memoria.
- Optimización de thumbnails.
- Lazy loading.
- Liberación de recursos.
- Pruebas en Chrome, Edge, Firefox y Safari.
- Landing page.
- Documentación.
- Publicación inicial.

**Entregable:** MVP publicable.

## 10. Primera etapa: Sprint 1

### Objetivo

Construir una interfaz visual profesional y funcional. No implementar todavía codificación ni exportación de video.

### Distribución visual

Diseño oscuro y minimalista, orientado a escritorio:

| Área | Tamaño aproximado |
|---|---:|
| Sidebar de herramientas | 64 px |
| Biblioteca multimedia | 260 px |
| Inspector | 280 px |
| Toolbar superior | 56 px |
| Timeline | 280–320 px |
| Preview | Espacio restante |

Los paneles podrán hacerse redimensionables en una iteración posterior.

### Tareas

- [ ] Crear proyecto Next.js con TypeScript y Tailwind.
- [ ] Configurar shadcn/ui y Lucide.
- [ ] Crear layout principal del editor.
- [ ] Crear sidebar de herramientas.
- [ ] Crear panel Media Library.
- [ ] Crear panel Preview.
- [ ] Crear Timeline con pistas visuales.
- [ ] Crear Inspector de propiedades.
- [ ] Implementar selección de clips de prueba.
- [ ] Crear proyecto vacío con configuración 1920 × 1080.

### Archivos iniciales

```text
features/editor/components/
├── EditorLayout.tsx
├── EditorHeader.tsx
├── EditorSidebar.tsx
├── MediaPanel.tsx
├── PreviewPanel.tsx
├── TimelinePanel.tsx
├── InspectorPanel.tsx
└── EditorWorkspace.tsx
```

### Ejemplo de layout

```tsx
"use client";

import { EditorHeader } from "./EditorHeader";
import { EditorSidebar } from "./EditorSidebar";
import { MediaPanel } from "./MediaPanel";
import { PreviewPanel } from "./PreviewPanel";
import { TimelinePanel } from "./TimelinePanel";
import { InspectorPanel } from "./InspectorPanel";

export function EditorLayout() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-[#111113] text-white">
      <EditorHeader />

      <div className="flex h-[calc(100%-56px)]">
        <EditorSidebar />
        <MediaPanel />

        <div className="flex min-w-0 flex-1 flex-col">
          <PreviewPanel />
          <TimelinePanel />
        </div>

        <InspectorPanel />
      </div>
    </main>
  );
}
```

### Ejemplo inicial del Timeline

```tsx
"use client";

const tracks = [
  { id: "video-1", name: "Video 1" },
  { id: "video-2", name: "Video 2" },
  { id: "text", name: "Texto" },
  { id: "audio", name: "Audio" },
];

export function TimelinePanel() {
  return (
    <section className="h-[320px] border-t border-white/10 bg-[#18181b]">
      <header className="flex h-10 items-center justify-between px-4">
        <span className="text-sm font-medium">Timeline</span>
        <div className="flex gap-2">
          <button aria-label="Alejar">−</button>
          <button aria-label="Acercar">+</button>
        </div>
      </header>

      <div className="overflow-auto p-3">
        {tracks.map((track) => (
          <div
            key={track.id}
            className="mb-2 flex h-14 items-center rounded bg-white/5"
          >
            <div className="w-28 shrink-0 px-3 text-xs">
              {track.name}
            </div>
            <div className="h-full flex-1 border-l border-white/10" />
          </div>
        ))}
      </div>
    </section>
  );
}
```

Estos componentes son esqueletos de partida. Deben completarse con estados, accesibilidad, interacciones y estilos consistentes.

### Criterios de aceptación del Sprint 1

Al terminar, el usuario debe poder:

- Abrir la aplicación.
- Visualizar todos los paneles.
- Crear un proyecto.
- Seleccionar una pista.
- Seleccionar un clip de prueba.
- Cambiar propiedades visuales.
- Navegar entre secciones.

Todavía no se requiere exportación ni procesamiento multimedia real.

## 11. Reglas de implementación

1. El editor será un componente cliente (`"use client"`).
2. No cargar FFmpeg ni WebCodecs hasta que se necesiten.
3. No guardar objetos `File`, `Blob` ni referencias multimedia en Zustand.
4. Guardar metadatos y estado en Zustand; binarios en IndexedDB.
5. El timeline usará una escala temporal independiente del ancho de pantalla.
6. Las operaciones de edición pasarán por el sistema de comandos.
7. La interfaz nunca debe bloquearse durante una tarea multimedia.
8. Liberar `ObjectURL`, frames, decoders, audio nodes y buffers cuando dejen de utilizarse.
9. Implementar cancelación y limpieza de tareas.
10. Mantener el motor independiente de React y Next.js.

## 12. Arquitectura SaaS futura

Aunque el MVP no tenga backend, diseñar los contratos para permitir estos servicios:

- Authentication.
- CloudProjectRepository.
- CloudAssetStorage.
- SubscriptionService.
- UserProfiles.
- Synchronization.

La futura arquitectura podrá tener:

```text
WebCut Studio Client
       |
       +-- LocalProjectRepository
       +-- LocalAssetStorage
       +-- LocalExportService
       |
       +-- Futuras implementaciones cloud
             +-- Authentication
             +-- CloudProjectRepository
             +-- CloudAssetStorage
             +-- SubscriptionService
             +-- Synchronization
```

Antes de cobrar por funcionalidades protegidas, implementar autenticación, validación de suscripciones del lado servidor, almacenamiento seguro y sincronización. El cliente no debe ser la autoridad para conceder planes premium.

## 13. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Memoria insuficiente | Procesar por frames, liberar recursos y limitar proyectos |
| Archivos grandes | Evitar copias repetidas y usar almacenamiento por referencias |
| Incompatibilidad de codecs | Detectar soporte antes de importar/exportar |
| Preview lento | Proxies, resolución reducida y decodificación eficiente |
| Timeline pesado | Canvas, virtualización y renderizado incremental |
| Pérdida de proyectos | Persistencia, backups exportables y gestión de cuotas |
| Diferencias entre navegadores | Adaptadores y pruebas de compatibilidad |

IndexedDB no es almacenamiento permanente garantizado. Solicitar almacenamiento persistente mediante `navigator.storage.persist()` cuando corresponda y ofrecer exportación/backup de proyectos.

### Navegadores objetivo

- Chrome: navegador principal.
- Edge: compatible.
- Firefox: soporte progresivo según funcionalidades.
- Safari: soporte progresivo, especialmente para WebCodecs.

No prometer exportación universal hasta completar pruebas reales de codecs y rendimiento.

## 14. Referencias oficiales

- Next.js: https://nextjs.org/docs
- WebCodecs: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
- Mediabunny: https://mediabunny.dev/
- FFmpeg WASM: https://ffmpegwasm.netlify.app/
- Dexie: https://dexie.org/docs/
- shadcn/ui: https://ui.shadcn.com/
- Zustand: https://zustand.docs.pmnd.rs/
- dnd-kit: https://dndkit.com/
- IndexedDB: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- Storage API: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API

---

# 15. Instrucciones para el agente de programación

Actúa como arquitecto de software y desarrollador senior especializado en React, Next.js, TypeScript y aplicaciones multimedia web.

Tu misión es implementar WebCut Studio siguiendo este documento como especificación del producto.

## Reglas de trabajo

1. Antes de modificar archivos, inspecciona la estructura existente del repositorio.
2. No sobrescribas código existente sin comprender su función.
3. Respeta las decisiones arquitectónicas y las reglas de dependencias de este documento.
4. Implementa por fases y entrega incrementos funcionales.
5. No simules funcionalidades que se describan como terminadas.
6. No introduzcas dependencias innecesarias.
7. Mantén TypeScript estricto y evita `any`.
8. Escribe pruebas para la lógica central.
9. Ejecuta lint, typecheck y tests después de cada etapa relevante.
10. Explica los archivos creados o modificados y las decisiones importantes.
11. Si una API o librería no es compatible con el navegador objetivo, documenta la limitación y propone una alternativa.
12. No implementes backend hasta que se solicite expresamente.

## Primera tarea

Implementa únicamente el Sprint 1:

- Configura el proyecto.
- Construye el layout completo del editor.
- Crea los paneles principales.
- Implementa el estado inicial con Zustand.
- Crea un proyecto vacío.
- Implementa selección de pistas y clips de prueba.
- Asegura una interfaz oscura, consistente y profesional.

No avances a importación multimedia ni exportación hasta que el Sprint 1 esté implementado y verificado.

Al finalizar, entrega:

- Resumen de implementación.
- Estructura de archivos.
- Comandos para ejecutar el proyecto.
- Pruebas realizadas y sus resultados.
- Limitaciones conocidas.
- Próximos pasos recomendados.
