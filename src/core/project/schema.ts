import { z } from "zod";

/**
 * Esquemas de validación del modelo de proyecto. Los tipos de TypeScript se
 * infieren de aquí para que validación y tipado nunca diverjan.
 *
 * Todos los tiempos (`start`, `duration`, `sourceStart`) son microsegundos
 * enteros (ver `core/types/time.ts`).
 */

const microseconds = z.number().int().nonnegative();

export const transformSchema = z.object({
  /** Desplazamiento horizontal desde el centro del lienzo, en píxeles del proyecto. */
  x: z.number(),
  /** Desplazamiento vertical desde el centro del lienzo, en píxeles del proyecto. */
  y: z.number(),
  scaleX: z.number().positive(),
  scaleY: z.number().positive(),
  /** Grados, sentido horario. */
  rotation: z.number(),
  /** 0 a 1. */
  opacity: z.number().min(0).max(1),
});

export const effectSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  enabled: z.boolean(),
  parameters: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
});

export const textStyleSchema = z.object({
  content: z.string(),
  fontSize: z.number().positive(),
  color: z.string(),
});

export const clipTypeSchema = z.enum(["video", "audio", "image", "text"]);

/** Recorte en fracciones del encuadre original (0 = sin recorte). */
export const cropSchema = z.object({
  left: z.number().min(0).max(0.95),
  top: z.number().min(0).max(0.95),
  right: z.number().min(0).max(0.95),
  bottom: z.number().min(0).max(0.95),
});

export const easingSchema = z.enum(["linear", "ease-in-out"]);

export const keyframeSchema = z.object({
  /** Microsegundos relativos al inicio del clip en el timeline. */
  time: z.number().int(),
  value: z.number(),
  easing: easingSchema,
});

/** Propiedades de la transformación que se pueden animar. */
export const animatablePropertySchema = z.enum(["x", "y", "scaleX", "scaleY", "rotation", "opacity"]);

export const keyframesSchema = z.partialRecord(animatablePropertySchema, z.array(keyframeSchema));

export const transitionTypeSchema = z.enum(["crossfade", "fade", "wipe-left", "slide-left"]);

/** Transición en el corte entre el clip anterior (adyacente, misma pista) y este. */
export const transitionSchema = z.object({
  type: transitionTypeSchema,
  /** Duración total, centrada en el corte. */
  duration: z.number().int().positive(),
});

export const NO_CROP = { left: 0, top: 0, right: 0, bottom: 0 } as const;

export const clipSchema = z.object({
  id: z.string().min(1),
  type: clipTypeSchema,
  name: z.string(),
  assetId: z.string().optional(),
  /** Posición del clip en la línea de tiempo. */
  start: microseconds,
  /** Duración visible en la línea de tiempo. */
  duration: z.number().int().positive(),
  /** Punto inicial dentro del archivo fuente. */
  sourceStart: microseconds,
  transform: transformSchema,
  effects: z.array(effectSchema),
  /** Solo para clips de tipo `text`. */
  text: textStyleSchema.optional(),
  /** Velocidad de reproducción (video/audio). 2 = el doble de rápido. */
  speed: z.number().min(0.1).max(10).default(1),
  /** Ganancia del audio (video/audio). 1 = original. */
  volume: z.number().min(0).max(4).default(1),
  crop: cropSchema.default(NO_CROP),
  keyframes: keyframesSchema.default({}),
  transitionIn: transitionSchema.optional(),
});

export const trackTypeSchema = z.enum(["video", "audio", "overlay"]);

export const trackSchema = z.object({
  id: z.string().min(1),
  type: trackTypeSchema,
  name: z.string(),
  muted: z.boolean(),
  locked: z.boolean(),
  visible: z.boolean(),
  clips: z.array(clipSchema),
});

export const projectSettingsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  backgroundColor: z.string(),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  settings: projectSettingsSchema,
  tracks: z.array(trackSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const mediaKindSchema = z.enum(["video", "audio", "image"]);

/**
 * Metadatos de un archivo importado. El binario vive aparte (IndexedDB) y se
 * referencia por `blobId`; los proyectos referencian el asset por `id`.
 */
export const mediaAssetSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  kind: mediaKindSchema,
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  /** Microsegundos; ausente en imágenes. */
  duration: microseconds.optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  hasAudio: z.boolean(),
  blobId: z.string().min(1),
  thumbnailBlobId: z.string().min(1).optional(),
  createdAt: z.number(),
});

export type Transform = z.infer<typeof transformSchema>;
export type Effect = z.infer<typeof effectSchema>;
export type TextStyle = z.infer<typeof textStyleSchema>;
export type ClipType = z.infer<typeof clipTypeSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type TrackType = z.infer<typeof trackTypeSchema>;
export type Track = z.infer<typeof trackSchema>;
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;
export type Project = z.infer<typeof projectSchema>;
export type MediaKind = z.infer<typeof mediaKindSchema>;
export type Crop = z.infer<typeof cropSchema>;
export type Easing = z.infer<typeof easingSchema>;
export type Keyframe = z.infer<typeof keyframeSchema>;
export type AnimatableProperty = z.infer<typeof animatablePropertySchema>;
export type Keyframes = z.infer<typeof keyframesSchema>;
export type TransitionType = z.infer<typeof transitionTypeSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
