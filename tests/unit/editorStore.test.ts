import { beforeEach, describe, expect, it } from "vitest";

import { removeClipsCommand, updateClipCommand } from "@/core/commands/projectCommands";
import { findClip } from "@/core/project/queries";
import { secondsToUs } from "@/core/types/time";
import { selectActiveProject, useEditorStore } from "@/features/editor/store/editorStore";

const initial = useEditorStore.getState();

function setupDemo() {
  const { createProject, openProject } = useEditorStore.getState();
  const project = createProject({ name: "Demo", template: "demo" });
  openProject(project.id);
  return project;
}

const active = () => selectActiveProject(useEditorStore.getState())!;

describe("editorStore", () => {
  beforeEach(() => useEditorStore.setState(initial, true));

  it("crea y abre proyectos", () => {
    const project = useEditorStore.getState().createProject({ name: "Vacío", template: "empty" });
    expect(useEditorStore.getState().projects[project.id]).toBe(project);
    expect(useEditorStore.getState().openProject(project.id)).toBe(true);
    expect(active().id).toBe(project.id);
    expect(useEditorStore.getState().openProject("no-existe")).toBe(false);
  });

  it("selecciona pistas y clips (simple y múltiple)", () => {
    const project = setupDemo();
    const [a, b] = project.tracks[2].clips;
    const { selectTrack, selectClip, clearSelection } = useEditorStore.getState();

    selectTrack(project.tracks[1].id);
    expect(useEditorStore.getState().selection).toEqual({ trackId: project.tracks[1].id, clipIds: [] });

    selectClip(a.id);
    expect(useEditorStore.getState().selection).toEqual({ trackId: project.tracks[2].id, clipIds: [a.id] });

    selectClip(b.id, { additive: true });
    expect(useEditorStore.getState().selection.clipIds).toEqual([a.id, b.id]);

    selectClip(a.id, { additive: true });
    expect(useEditorStore.getState().selection.clipIds).toEqual([b.id]);

    clearSelection();
    expect(useEditorStore.getState().selection).toEqual({ trackId: null, clipIds: [] });
  });

  it("ejecuta comandos con undo/redo y poda la selección", () => {
    const project = setupDemo();
    const clip = project.tracks[2].clips[0];
    const store = useEditorStore.getState();

    store.selectClip(clip.id);
    expect(store.execute(updateClipCommand(active(), clip.id, { transform: { rotation: 45 } }))).toBe(true);
    expect(findClip(active(), clip.id)?.clip.transform.rotation).toBe(45);

    store.execute(removeClipsCommand(active(), [clip.id]));
    expect(findClip(active(), clip.id)).toBeNull();
    expect(useEditorStore.getState().selection.clipIds).toEqual([]);

    store.undo();
    expect(findClip(active(), clip.id)?.clip.transform.rotation).toBe(45);
    store.undo();
    expect(findClip(active(), clip.id)?.clip.transform.rotation).toBe(0);
    store.redo();
    expect(findClip(active(), clip.id)?.clip.transform.rotation).toBe(45);

    expect(store.execute(null)).toBe(false);
  });

  it("limita el playhead a la duración del proyecto", () => {
    setupDemo();
    const { setPlayhead } = useEditorStore.getState();
    setPlayhead(secondsToUs(100));
    expect(useEditorStore.getState().playhead).toBe(secondsToUs(11));
    setPlayhead(-1);
    expect(useEditorStore.getState().playhead).toBe(0);
  });

  it("no reproduce un proyecto vacío y reinicia desde el principio al final", () => {
    const empty = useEditorStore.getState().createProject({ name: "Vacío", template: "empty" });
    useEditorStore.getState().openProject(empty.id);
    useEditorStore.getState().setPlaying(true);
    expect(useEditorStore.getState().isPlaying).toBe(false);

    setupDemo();
    useEditorStore.getState().setPlayhead(secondsToUs(11));
    useEditorStore.getState().setPlaying(true);
    expect(useEditorStore.getState()).toMatchObject({ isPlaying: true, playhead: 0 });
  });
});
