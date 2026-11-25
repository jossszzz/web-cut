"use client";

import { ChevronLeft, ChevronRight, Lock, Maximize, Minimize, RotateCcw, RotateCw } from "lucide-react";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { evaluateTransform, findKeyframeAt, isAnimated, keyframeTimes } from "@/core/animation/keyframes";
import {
  MAX_SPEED,
  MIN_SPEED,
  normalizeRotation,
  resetTransformCommand,
  setClipSpeedCommand,
  setTransformCommand,
  setTransitionCommand,
  toggleKeyframeCommand,
} from "@/core/commands/editCommands";
import { updateClipCommand, type ClipPatch } from "@/core/commands/projectCommands";
import { moveClipsCommand, setClipTimingCommand } from "@/core/commands/timelineCommands";
import {
  DEFAULT_TRANSITION_DURATION,
  maxTransitionDuration,
  previousAdjacent,
  TRANSITION_LABELS,
} from "@/core/playback/composition";
import { IDENTITY_TRANSFORM } from "@/core/project/factory";
import type { ClipLocation } from "@/core/project/queries";
import type { AnimatableProperty, Clip, Crop, Project, Transform, TransitionType } from "@/core/project/schema";
import { resolveMove, resolveTrim } from "@/core/timeline/edit";
import { formatTimecode, frameToUs, secondsToUs, US_PER_SECOND, usToSeconds, type Microseconds } from "@/core/types/time";
import { useMediaStore } from "@/features/media/store/mediaStore";
import { CLIP_COLORS } from "@/lib/constants/clipColors";

import { selectActiveProject, useEditorStore } from "../../store/editorStore";
import { InspectorSection, NumberField, ReadOnlyField, SliderField, TextField } from "./fields";
import { KeyframeButton } from "./KeyframeButton";

const SPEED_PRESETS = [0.5, 1, 1.5, 2];
const MAX_CROP_TOTAL = 0.95;

/** Proyecto más reciente: durante un arrastre el prop puede ir un render por detrás. */
const latestProject = (fallback: Project) => selectActiveProject(useEditorStore.getState()) ?? fallback;

/** Durante la reproducción, los valores animados del inspector se refrescan a este ritmo. */
const PLAYING_REFRESH: Microseconds = US_PER_SECOND / 4;

/**
 * Tiempo del cursor con la resolución justa para el inspector, para no
 * re-renderizarlo en cada frame de la reproducción:
 * - clip sin keyframes: solo importa si el cursor está dentro (devuelve su inicio) o fuera (-1);
 * - con keyframes: el tiempo exacto en pausa y ~4 veces/s mientras se reproduce.
 * Las ediciones leen el tiempo real en el momento de aplicarse (`editTimeNow`).
 */
export function inspectorPlayhead(clip: Clip, playhead: Microseconds, isPlaying: boolean): Microseconds {
  if (keyframeTimes(clip).length === 0) {
    return playhead >= clip.start && playhead <= clip.start + clip.duration ? clip.start : -1;
  }
  return isPlaying ? Math.floor(playhead / PLAYING_REFRESH) * PLAYING_REFRESH : playhead;
}

function useInspectorPlayhead(clip: Clip): Microseconds {
  return useEditorStore((state) => inspectorPlayhead(clip, state.playhead, state.isPlaying));
}

export function ClipInspector({ project, location }: { project: Project; location: ClipLocation }) {
  const execute = useEditorStore((state) => state.execute);
  const sealHistory = useEditorStore((state) => state.sealHistory);
  const playhead = useInspectorPlayhead(location.clip);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const { clip, track } = location;
  const { fps } = project.settings;
  const asset = useMediaStore((state) => (clip.assetId ? state.assets[clip.assetId] : undefined));
  const sourceDuration = asset?.duration;

  const tolerance = Math.round(frameToUs(1, fps) / 2);
  const inside = playhead >= clip.start && playhead <= clip.start + clip.duration;
  const local = Math.min(Math.max(0, playhead - clip.start), clip.duration);
  /** Instante real del cursor dentro del clip, leído al aplicar una edición. */
  const editTimeNow = () => {
    const now = useEditorStore.getState().playhead;
    return clip.start + Math.min(Math.max(0, now - clip.start), clip.duration);
  };
  const t = evaluateTransform(clip, local);

  const isVisual = clip.type !== "audio";
  const hasSource = clip.type === "video" || clip.type === "audio";
  const hasAudio = clip.type === "audio" || (clip.type === "video" && (asset?.hasAudio ?? false));
  const canCrop = clip.type === "video" || clip.type === "image";

  const update = (patch: ClipPatch, label: string, mergeKey?: string) =>
    execute(updateClipCommand(latestProject(project), clip.id, patch, { label, mergeKey }));

  const transform = (values: Partial<Transform>, label: string, field?: string) =>
    execute(
      setTransformCommand(latestProject(project), clip.id, values, { time: editTimeNow(), tolerance }, {
        label,
        mergeKey: field ? `${clip.id}:${field}` : undefined,
      }),
    );

  const keyframeState = (properties: readonly AnimatableProperty[]) => ({
    animated: properties.some((p) => isAnimated(clip, p)),
    atPlayhead: findKeyframeAt(clip.keyframes[properties[0]], local, tolerance) !== -1,
    disabled: !inside || track.locked,
    onToggle: () =>
      execute(toggleKeyframeCommand(latestProject(project), clip.id, properties, { time: editTimeNow(), tolerance })),
  });

  const times = keyframeTimes(clip);
  const prevKeyframe = times.findLast((k) => k < local - tolerance);
  const nextKeyframe = times.find((k) => k > local + tolerance);

  /** Mover a un inicio exacto: mismas reglas que al arrastrar (sin solapes). */
  const setStart = (seconds: number) => {
    const result = resolveMove(project, { clipIds: [clip.id], deltaTime: secondsToUs(seconds) - clip.start, trackOffset: 0 });
    if (result) execute(moveClipsCommand(project, result.moves));
  };
  /** Cambiar la duración: equivale a recortar el borde final. */
  const setDuration = (seconds: number) => {
    const result = resolveTrim(project, clip.id, "end", clip.start + secondsToUs(seconds), {
      sourceDuration,
      minDuration: frameToUs(1, fps),
    });
    if (result) execute(setClipTimingCommand(project, clip.id, result));
  };

  /** Escala para cubrir todo el lienzo (sin bandas), según el tamaño visible tras el recorte. */
  const fillScale = () => {
    if (!asset?.width || !asset.height) return 1;
    const { width: W, height: H } = project.settings;
    const w = asset.width * (1 - clip.crop.left - clip.crop.right);
    const h = asset.height * (1 - clip.crop.top - clip.crop.bottom);
    const contain = Math.min(W / asset.width, H / asset.height);
    return Math.max(W / (w * contain), H / (h * contain));
  };

  const setCrop = (side: keyof Crop, percent: number) => {
    const opposite: Record<keyof Crop, keyof Crop> = { left: "right", right: "left", top: "bottom", bottom: "top" };
    const value = Math.min(percent / 100, MAX_CROP_TOTAL - clip.crop[opposite[side]]);
    update({ crop: { [side]: Math.max(0, value) } }, "Recortar encuadre", `${clip.id}:crop-${side}`);
  };

  const prev = previousAdjacent(track, clip);
  const transitionMax = prev ? maxTransitionDuration(prev, clip) : 0;
  const setTransition = (type: TransitionType | "none", duration = clip.transitionIn?.duration ?? DEFAULT_TRANSITION_DURATION) =>
    execute(setTransitionCommand(latestProject(project), clip.id, type === "none" ? null : { type, duration }));

  return (
    <fieldset disabled={track.locked} className="min-w-0">
      <InspectorSection title="Clip">
        <div className="flex items-center gap-2">
          <Badge style={{ backgroundColor: CLIP_COLORS[clip.type].fill }} className="text-white">
            {CLIP_COLORS[clip.type].label}
          </Badge>
          <span className="truncate text-xs text-muted-foreground">en {track.name}</span>
        </div>
        {track.locked && (
          <p className="flex items-center gap-2 rounded-md bg-amber-400/10 px-2 py-1.5 text-xs text-amber-300">
            <Lock className="size-3.5" aria-hidden /> La pista está bloqueada.
          </p>
        )}
        <TextField label="Nombre" value={clip.name} onCommit={(name) => update({ name }, "Renombrar clip")} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Inicio" value={usToSeconds(clip.start)} min={0} step={0.1} precision={2} suffix="s" onCommit={setStart} />
          <NumberField label="Duración" value={usToSeconds(clip.duration)} min={0} step={0.1} precision={2} suffix="s" onCommit={setDuration} />
        </div>
        <div className="flex flex-col gap-1.5">
          <ReadOnlyField label="Timecode" value={`${formatTimecode(clip.start, fps)} – ${formatTimecode(clip.start + clip.duration, fps)}`} />
          {hasSource && <ReadOnlyField label="Inicio en fuente" value={formatTimecode(clip.sourceStart, fps)} />}
          {sourceDuration !== undefined && <ReadOnlyField label="Duración de la fuente" value={formatTimecode(sourceDuration, fps)} />}
        </div>
      </InspectorSection>

      {clip.type === "text" && clip.text && (
        <InspectorSection title="Texto">
          <TextField label="Contenido" multiline value={clip.text.content} onCommit={(content) => update({ text: { content } }, "Editar texto")} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Tamaño"
              value={clip.text.fontSize}
              min={8}
              max={600}
              suffix="px"
              onCommit={(fontSize) => update({ text: { fontSize } }, "Tamaño de texto")}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${clip.id}-color`} className="text-xs text-muted-foreground">
                Color
              </label>
              <input
                id={`${clip.id}-color`}
                type="color"
                value={clip.text.color}
                onChange={(event) => update({ text: { color: event.target.value } }, "Color de texto", `${clip.id}:color`)}
                onBlur={sealHistory}
                className="h-8 w-full cursor-pointer rounded-lg border border-input bg-input/30 px-1"
              />
            </div>
          </div>
        </InspectorSection>
      )}

      {isVisual && (
        <InspectorSection
          title="Transformación"
          action={
            <Button
              variant="ghost"
              size="xs"
              onClick={() => execute(resetTransformCommand(latestProject(project), clip.id, IDENTITY_TRANSFORM))}
            >
              <RotateCcw data-icon="inline-start" />
              Restablecer
            </Button>
          }
        >
          <div className="flex items-center justify-between rounded-md bg-panel-raised px-2 py-1 text-xs text-muted-foreground">
            <span>
              {times.length === 0 ? "Sin keyframes" : `${times.length} keyframe${times.length === 1 ? "" : "s"}`}
              {!inside && times.length > 0 && " · cursor fuera del clip"}
            </span>
            <span className="flex items-center">
              <button
                type="button"
                aria-label="Keyframe anterior"
                disabled={prevKeyframe === undefined}
                onClick={() => prevKeyframe !== undefined && setPlayhead(clip.start + prevKeyframe)}
                className="grid size-5 place-items-center rounded hover:text-foreground disabled:opacity-30"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Keyframe siguiente"
                disabled={nextKeyframe === undefined}
                onClick={() => nextKeyframe !== undefined && setPlayhead(clip.start + nextKeyframe)}
                className="grid size-5 place-items-center rounded hover:text-foreground disabled:opacity-30"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Posición X"
              value={t.x}
              suffix="px"
              onCommit={(x) => transform({ x }, "Mover clip")}
              labelAction={<KeyframeButton property="posición X" {...keyframeState(["x"])} />}
            />
            <NumberField
              label="Posición Y"
              value={t.y}
              suffix="px"
              onCommit={(y) => transform({ y }, "Mover clip")}
              labelAction={<KeyframeButton property="posición Y" {...keyframeState(["y"])} />}
            />
          </div>
          <SliderField
            label="Escala"
            value={Math.round(t.scaleX * 100)}
            min={1}
            max={400}
            format={(v) => `${v}%`}
            onChange={(v) => transform({ scaleX: v / 100, scaleY: v / 100 }, "Escalar clip", "scale")}
            onCommit={sealHistory}
            labelAction={<KeyframeButton property="escala" {...keyframeState(["scaleX", "scaleY"])} />}
          />
          {clip.type !== "text" && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={() => transform({ x: 0, y: 0, scaleX: 1, scaleY: 1 }, "Ajustar al lienzo")}>
                <Minimize data-icon="inline-start" />
                Ajustar
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const s = Math.round(fillScale() * 1000) / 1000;
                  transform({ x: 0, y: 0, scaleX: s, scaleY: s }, "Rellenar el lienzo");
                }}
              >
                <Maximize data-icon="inline-start" />
                Rellenar
              </Button>
            </div>
          )}
          <SliderField
            label="Rotación"
            value={Math.round(normalizeRotation(t.rotation))}
            min={-180}
            max={180}
            format={(v) => `${v}°`}
            onChange={(rotation) => transform({ rotation }, "Rotar clip", "rotation")}
            onCommit={sealHistory}
            labelAction={<KeyframeButton property="rotación" {...keyframeState(["rotation"])} />}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => transform({ rotation: normalizeRotation(t.rotation + 90) }, "Rotar 90°")}
          >
            <RotateCw data-icon="inline-start" />
            Rotar 90°
          </Button>
          <SliderField
            label="Opacidad"
            value={Math.round(t.opacity * 100)}
            min={0}
            max={100}
            format={(v) => `${v}%`}
            onChange={(v) => transform({ opacity: v / 100 }, "Opacidad", "opacity")}
            onCommit={sealHistory}
            labelAction={<KeyframeButton property="opacidad" {...keyframeState(["opacity"])} />}
          />
        </InspectorSection>
      )}

      {canCrop && (
        <InspectorSection
          title="Recorte"
          action={
            <Button
              variant="ghost"
              size="xs"
              onClick={() => update({ crop: { left: 0, top: 0, right: 0, bottom: 0 } }, "Quitar recorte")}
            >
              Quitar
            </Button>
          }
        >
          {(["left", "right", "top", "bottom"] as const).map((side) => (
            <SliderField
              key={side}
              label={{ left: "Izquierda", right: "Derecha", top: "Arriba", bottom: "Abajo" }[side]}
              value={Math.round(clip.crop[side] * 100)}
              min={0}
              max={90}
              format={(v) => `${v}%`}
              onChange={(v) => setCrop(side, v)}
              onCommit={sealHistory}
            />
          ))}
        </InspectorSection>
      )}

      {hasSource && (
        <InspectorSection title="Velocidad">
          <div className="grid grid-cols-4 gap-1" role="group" aria-label="Velocidad predefinida">
            {SPEED_PRESETS.map((speed) => (
              <button
                key={speed}
                type="button"
                aria-pressed={clip.speed === speed}
                onClick={() => execute(setClipSpeedCommand(latestProject(project), clip.id, speed))}
                className={cn(
                  "h-7 rounded-md border text-xs tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  clip.speed === speed ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-accent",
                )}
              >
                {speed}×
              </button>
            ))}
          </div>
          <NumberField
            label="Velocidad exacta"
            value={clip.speed}
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={0.05}
            precision={2}
            suffix="×"
            onCommit={(speed) => execute(setClipSpeedCommand(latestProject(project), clip.id, speed))}
          />
          <p className="text-xs text-muted-foreground">
            Cambiar la velocidad ajusta la duración del clip; si chocaría con el siguiente, se acorta hasta él.
          </p>
        </InspectorSection>
      )}

      {hasAudio && (
        <InspectorSection title="Audio">
          <SliderField
            label="Volumen"
            value={Math.round(clip.volume * 100)}
            min={0}
            max={200}
            format={(v) => (v === 0 ? "Silencio" : `${v}%`)}
            onChange={(v) => update({ volume: v / 100 }, "Volumen", `${clip.id}:volume`)}
            onCommit={sealHistory}
          />
        </InspectorSection>
      )}

      {isVisual && (
        <InspectorSection title="Transición de entrada">
          {prev && prev.type !== "audio" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${clip.id}-transition`} className="text-xs text-muted-foreground">
                  Desde «{prev.name}»
                </label>
                <select
                  id={`${clip.id}-transition`}
                  value={clip.transitionIn?.type ?? "none"}
                  onChange={(event) => setTransition(event.target.value as TransitionType | "none")}
                  className="h-8 w-full rounded-lg border border-input bg-input/30 px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="none">Ninguna (corte)</option>
                  {(Object.keys(TRANSITION_LABELS) as TransitionType[]).map((type) => (
                    <option key={type} value={type}>
                      {TRANSITION_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
              {clip.transitionIn && (
                <NumberField
                  label="Duración de la transición"
                  value={usToSeconds(Math.min(clip.transitionIn.duration, transitionMax))}
                  min={0.1}
                  max={usToSeconds(transitionMax)}
                  step={0.1}
                  precision={2}
                  suffix="s"
                  onCommit={(seconds) => setTransition(clip.transitionIn!.type, secondsToUs(seconds))}
                />
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Coloca este clip justo a continuación de otro en la misma pista para añadir una transición.
            </p>
          )}
        </InspectorSection>
      )}
    </fieldset>
  );
}
