"use client";

import { usePlaybackClock } from "@/features/preview/playback/usePlaybackClock";

import { useEditorShortcuts } from "../hooks/useEditorShortcuts";
import { EditorHeader } from "./EditorHeader";
import { EditorSidebar } from "./EditorSidebar";
import { InspectorPanel } from "./InspectorPanel";
import { MediaPanel } from "./MediaPanel";
import { PreviewPanel } from "./PreviewPanel";
import { TimelinePanel } from "./TimelinePanel";

/**
 * Distribución del editor (escritorio):
 * header 56 px · sidebar 64 px · biblioteca 260 px · inspector 280 px ·
 * timeline 300 px · preview el espacio restante.
 */
export function EditorLayout() {
  usePlaybackClock();
  useEditorShortcuts();

  return (
    <main className="flex h-screen w-screen min-w-[1024px] flex-col overflow-hidden bg-background text-foreground">
      <EditorHeader />
      <div className="flex min-h-0 flex-1">
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
