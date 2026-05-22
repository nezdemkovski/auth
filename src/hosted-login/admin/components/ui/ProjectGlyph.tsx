import type { ProjectSummary } from "../../types";

export function ProjectGlyph({ project }: { project: ProjectSummary }) {
  if (project.iconUrl) {
    return (
      <img
        src={project.iconUrl}
        alt=""
        className="h-full w-full rounded-[6px] object-cover"
        loading="lazy"
      />
    );
  }

  return <>{project.name.charAt(0).toUpperCase()}</>;
}
