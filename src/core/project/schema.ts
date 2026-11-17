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

export const mediaAssetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  duration: microseconds.optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  blobId: z.string().min(1),
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
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
