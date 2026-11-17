import { secondsToUs, type Microseconds } from "../types/time";
import { createId, type IdFactory } from "./ids";
import type {
  Clip,
  ClipType,
  Project,
  ProjectSettings,
  TextStyle,
  Track,
  TrackType,
  Transform,
} from "./schema";

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  backgroundColor: "#000000",
};

export const IDENTITY_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
};

export const DEFAULT_TEXT_STYLE: TextStyle = {
  content: "Texto",
  fontSize: 96,
  color: "#ffffff",
};

/** Duración por defecto de un clip de texto o imagen recién creado. */
export const DEFAULT_STILL_DURATION: Microseconds = secondsToUs(5);

export interface FactoryOptions {
  idFactory?: IdFactory;
  now?: number;
}

export function createTrack(
  type: TrackType,
  name: string,
  { idFactory = createId }: FactoryOptions = {},
): Track {
  return {
    id: idFactory(),
    type,
    name,
    muted: false,
    locked: false,
    visible: true,
    clips: [],
  };
}

export interface CreateClipInput {
  type: ClipType;
  name: string;
  start: Microseconds;
  duration: Microseconds;
  sourceStart?: Microseconds;
  assetId?: string;
  transform?: Partial<Transform>;
  text?: Partial<TextStyle>;
}

export function createClip(
  input: CreateClipInput,
  { idFactory = createId }: FactoryOptions = {},
): Clip {
  const clip: Clip = {
    id: idFactory(),
    type: input.type,
    name: input.name,
    start: input.start,
    duration: input.duration,
    sourceStart: input.sourceStart ?? 0,
    transform: { ...IDENTITY_TRANSFORM, ...input.transform },
    effects: [],
  };
  if (input.assetId) clip.assetId = input.assetId;
  if (input.type === "text") clip.text = { ...DEFAULT_TEXT_STYLE, ...input.text };
  return clip;
}

export interface CreateProjectInput extends FactoryOptions {
  name: string;
  settings?: Partial<ProjectSettings>;
}

/**
 * Proyecto vacío 1920 × 1080 a 30 fps con las pistas por defecto.
 *
 * Las pistas se ordenan de arriba abajo como en el timeline: la primera es la
 * capa superior de la composición (Texto > Video 2 > Video 1) y el audio
 * queda al final.
 */
export function createEmptyProject({
  name,
  settings,
  idFactory = createId,
  now = Date.now(),
}: CreateProjectInput): Project {
  const options = { idFactory };
  return {
    id: idFactory(),
    name: name.trim() || "Proyecto sin título",
    settings: { ...DEFAULT_PROJECT_SETTINGS, ...settings },
    tracks: [
      createTrack("overlay", "Texto", options),
      createTrack("video", "Video 2", options),
      createTrack("video", "Video 1", options),
      createTrack("audio", "Audio", options),
    ],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Proyecto de demostración con clips de prueba sin medios reales.
 * Sirve para probar selección, inspector y preview antes de la Fase 2
 * (importación). Los clips no referencian ningún asset.
 */
export function createDemoProject(input: CreateProjectInput): Project {
  const project = createEmptyProject(input);
  const options = { idFactory: input.idFactory ?? createId };
  const s = secondsToUs;
  const [text, video2, video1, audio] = project.tracks;

  video1.clips = [
    createClip({ type: "video", name: "Toma A", start: 0, duration: s(5) }, options),
    createClip({ type: "video", name: "Toma B", start: s(5), duration: s(6), sourceStart: s(2) }, options),
  ];
  video2.clips = [
    createClip(
      {
        type: "image",
        name: "Logo",
        start: s(2),
        duration: s(6),
        transform: { x: 700, y: -340, scaleX: 0.2, scaleY: 0.2 },
      },
      options,
    ),
  ];
  text.clips = [
    createClip(
      {
        type: "text",
        name: "Título",
        start: s(1),
        duration: s(5),
        transform: { y: 320 },
        text: { content: "WebCut Studio", fontSize: 120 },
      },
      options,
    ),
  ];
  audio.clips = [
    createClip({ type: "audio", name: "Música", start: 0, duration: s(11) }, options),
  ];

  return project;
}
