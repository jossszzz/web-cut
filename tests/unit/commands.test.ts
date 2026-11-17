import { describe, expect, it } from "vitest";

import { canRedo, canUndo, createHistory, executeCommand, redo, sealHistory, undo } from "@/core/commands/history";
import {
  addClipCommand,
  removeClipsCommand,
  updateClipCommand,
  updateProjectCommand,
  updateTrackCommand,
} from "@/core/commands/projectCommands";
import type { Command } from "@/core/commands/types";
import { createClip, createDemoProject } from "@/core/project/factory";
import { findClip } from "@/core/project/queries";
import type { Project } from "@/core/project/schema";

import { sequentialIds } from "./helpers";

function demo(): Project {
  return createDemoProject({ name: "Demo", idFactory: sequentialIds(), now: 0 });
}

function run(project: Project, command: Command | null): Project {
  if (!command) throw new Error("comando nulo");
  return command.execute(project);
}

describe("updateClipCommand", () => {
  it("modifica la transformación y la deshace sin mutar el original", () => {
    const project = demo();
    const clip = project.tracks[2].clips[0];
    const command = updateClipCommand(project, clip.id, { transform: { opacity: 0.5, x: 10 } });
    const next = run(project, command);

    expect(findClip(next, clip.id)?.clip.transform).toMatchObject({ opacity: 0.5, x: 10, scaleX: 1 });
    expect(clip.transform.opacity).toBe(1);
    expect(command!.undo(next)).toEqual(project);
  });

  it("no permite editar clips de pistas bloqueadas", () => {
    const project = demo();
    const locked = run(project, updateTrackCommand(project, project.tracks[2].id, { locked: true }));
    const clipId = locked.tracks[2].clips[0].id;
    expect(updateClipCommand(locked, clipId, { name: "X" })).toBeNull();
    expect(removeClipsCommand(locked, [clipId])).toBeNull();
  });

  it("actualiza el estilo de texto", () => {
    const project = demo();
    const textClip = project.tracks[0].clips[0];
    const next = run(project, updateClipCommand(project, textClip.id, { text: { content: "Hola" } }));
    expect(findClip(next, textClip.id)?.clip.text).toMatchObject({ content: "Hola", fontSize: 120 });
  });
});

describe("addClipCommand / removeClipsCommand", () => {
  it("añade un clip ordenado por inicio y lo deshace", () => {
    const project = demo();
    const track = project.tracks[2];
    const clip = createClip({ type: "video", name: "Nuevo", start: 1, duration: 10 }, { idFactory: () => "nuevo" });
    const command = addClipCommand(project, track.id, clip)!;
    const next = command.execute(project);
    expect(next.tracks[2].clips.map((c) => c.name)).toEqual(["Toma A", "Nuevo", "Toma B"]);
    expect(command.undo(next)).toEqual(project);
  });

  it("elimina varios clips de distintas pistas y los restaura en su posición", () => {
    const project = demo();
    const ids = [project.tracks[2].clips[0].id, project.tracks[3].clips[0].id];
    const command = removeClipsCommand(project, ids)!;
    const next = command.execute(project);
    expect(next.tracks[2].clips.map((c) => c.name)).toEqual(["Toma B"]);
    expect(next.tracks[3].clips).toHaveLength(0);
    expect(command.undo(next)).toEqual(project);
  });
});

describe("updateProjectCommand", () => {
  it("rechaza nombres vacíos y cambia la configuración", () => {
    const project = demo();
    expect(updateProjectCommand(project, { name: "  " })).toBeNull();
    const next = run(project, updateProjectCommand(project, { settings: { width: 1080, height: 1920 } }));
    expect(next.settings).toMatchObject({ width: 1080, height: 1920, fps: 30 });
  });
});

describe("history", () => {
  it("hace undo/redo y limpia el futuro al ejecutar un comando nuevo", () => {
    let project = demo();
    const original = project;
    let history = createHistory();
    const clipId = project.tracks[2].clips[0].id;

    ({ project, history } = executeCommand(project, history, updateClipCommand(project, clipId, { name: "A" })!));
    ({ project, history } = executeCommand(project, history, updateClipCommand(project, clipId, { name: "B" })!));
    expect(findClip(project, clipId)?.clip.name).toBe("B");

    ({ project, history } = undo(project, history));
    expect(findClip(project, clipId)?.clip.name).toBe("A");
    expect(canRedo(history)).toBe(true);

    ({ project, history } = redo(project, history));
    expect(findClip(project, clipId)?.clip.name).toBe("B");

    ({ project, history } = undo(project, history));
    ({ project, history } = executeCommand(project, history, updateClipCommand(project, clipId, { name: "C" })!));
    expect(canRedo(history)).toBe(false);

    ({ project, history } = undo(project, history));
    ({ project, history } = undo(project, history));
    expect(project).toEqual(original);
    expect(canUndo(history)).toBe(false);
  });

  it("fusiona comandos con la misma mergeKey hasta sellar el historial", () => {
    let project = demo();
    let history = createHistory();
    const clipId = project.tracks[2].clips[0].id;
    const opacity = (value: number) =>
      updateClipCommand(project, clipId, { transform: { opacity: value } }, { mergeKey: `opacity:${clipId}` })!;

    for (const value of [0.9, 0.7, 0.4]) {
      ({ project, history } = executeCommand(project, history, opacity(value)));
    }
    expect(history.past).toHaveLength(1);

    history = sealHistory(history);
    ({ project, history } = executeCommand(project, history, opacity(0.2)));
    expect(history.past).toHaveLength(2);

    ({ project, history } = undo(project, history));
    expect(findClip(project, clipId)?.clip.transform.opacity).toBe(0.4);
    ({ project, history } = undo(project, history));
    expect(findClip(project, clipId)?.clip.transform.opacity).toBe(1);
  });

  it("undo sin historial no cambia nada", () => {
    const project = demo();
    const history = createHistory();
    expect(undo(project, history)).toEqual({ project, history });
    expect(redo(project, history)).toEqual({ project, history });
  });
});
