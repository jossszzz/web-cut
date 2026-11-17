import type { Metadata } from "next";

import { ProjectsScreen } from "@/features/projects/components/ProjectsScreen";

export const metadata: Metadata = { title: "Proyectos" };

export default function ProjectsPage() {
  return <ProjectsScreen />;
}
