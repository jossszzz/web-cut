import type { Metadata } from "next";
import { Suspense } from "react";

import { EditorWorkspace } from "@/features/editor/components/EditorWorkspace";

export const metadata: Metadata = { title: "Editor" };

export default function EditorPage({ params }: PageProps<"/editor/[projectId]">) {
  return (
    <Suspense fallback={<div className="h-screen bg-background" aria-busy="true" />}>
      {params.then(({ projectId }) => (
        <EditorWorkspace projectId={projectId} />
      ))}
    </Suspense>
  );
}
