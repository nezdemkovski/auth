import { useMemo, useState } from "react";
import { ExternalLink, FileIcon, Folder, Image, Search } from "lucide-react";

import type { ProjectSummary, StorageObject } from "../types";
import { fileNameFromUrl, formatBytes, formatDate } from "../utils/format";
import { Card, EmptyState, FormAlert, UsersSkeleton } from "@nezdemkovski/auth-ui";

type FolderId = "images" | "files";

export function FilesView({
  project,
  objects,
  loading,
  error
}: {
  project: ProjectSummary;
  objects: StorageObject[];
  loading: boolean;
  error: string | null;
}) {
  const [folder, setFolder] = useState<FolderId>("images");
  const [query, setQuery] = useState("");
  const folders = useMemo(
    () => [
      {
        id: "images" as const,
        label: "images",
        description: "Realm images and user images",
        objects: objects.filter((object) => object.folder === "images")
      },
      {
        id: "files" as const,
        label: "files",
        description: "Generic files",
        objects: objects.filter((object) => object.folder === "files")
      }
    ],
    [objects]
  );
  const selectedFolder = folders.find((item) => item.id === folder) ?? folders[0];
  const visibleObjects = selectedFolder.objects.filter((object) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return (
      object.objectKey.toLowerCase().includes(normalizedQuery) ||
      object.originalFileName.toLowerCase().includes(normalizedQuery) ||
      fileNameFromUrl(object.publicUrl).toLowerCase().includes(normalizedQuery) ||
      object.mimeType.toLowerCase().includes(normalizedQuery)
    );
  });

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="eyebrow">Files</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          <code className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-muted">
            {project.schema}
          </code>
        </div>
        <h1 className="serif text-[56px] leading-[0.95] tracking-[-0.03em] text-ink sm:text-[64px]">
          {project.name} files<em>.</em>
        </h1>
        <p className="mt-3 max-w-[42rem] text-[14px] leading-[1.55] text-muted">
          Browse uploaded realm images, user images, and future file objects.
        </p>
      </div>

      <Card padding={false}>
        {error ? (
          <div className="p-6">
            <FormAlert>{error}</FormAlert>
          </div>
        ) : loading ? (
          <UsersSkeleton />
        ) : objects.length === 0 ? (
          <EmptyState
            title="No files yet"
            description="Uploaded images and files will appear here."
          />
        ) : (
          <div className="grid min-h-[520px] lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="border-b border-border bg-surface-muted/50 p-4 lg:border-b-0 lg:border-r">
              <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                Storage
              </div>
              <div className="space-y-1">
                {folders.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFolder(item.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                      item.id === folder
                        ? "border-border-strong bg-surface text-ink"
                        : "border-transparent text-muted hover:bg-surface-hover hover:text-ink"
                    }`}
                  >
                    <Folder className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[12px] font-semibold">
                        {item.label}
                      </span>
                      <span className="block truncate text-[11.5px] text-muted">
                        {item.description}
                      </span>
                    </span>
                    <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted">
                      {item.objects.length}
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <section className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h2 className="font-mono text-[14px] font-semibold text-ink">
                    /{selectedFolder.label}
                  </h2>
                  <p className="mt-1 text-[12px] text-muted">
                    {visibleObjects.length} visible of {selectedFolder.objects.length}
                  </p>
                </div>
                <label className="relative block min-w-[220px] max-w-full">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                    aria-hidden="true"
                  />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    placeholder="Search files"
                    className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-[13px] text-ink outline-none focus:border-border-strong focus:shadow-[0_0_0_3px_var(--focus-ring)]"
                  />
                </label>
              </div>

              {visibleObjects.length === 0 ? (
                <EmptyState
                  title="No matching files"
                  description="Adjust the search query or select another folder."
                />
              ) : (
                <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                  {visibleObjects.map((object) => (
                    <StorageObjectCard key={object.id} object={object} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </Card>
    </div>
  );
}

function StorageObjectCard({ object }: { object: StorageObject }) {
  const fileName =
    object.originalFileName || fileNameFromUrl(object.publicUrl) || object.objectKey;
  const isImage = object.mimeType.startsWith("image/");

  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface-muted">
      <div className="flex aspect-[4/3] items-center justify-center border-b border-border bg-bg">
        {isImage ? (
          <img
            src={object.publicUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <FileIcon className="h-8 w-8 text-muted" aria-hidden="true" />
        )}
      </div>
      <div className="space-y-3 p-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted">
            {isImage ? (
              <Image className="h-4 w-4" aria-hidden="true" />
            ) : (
              <FileIcon className="h-4 w-4" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-mono text-[12px] font-semibold text-ink">
              {fileName}
            </h3>
            <p className="mt-1 text-[11.5px] text-muted">
              {formatBytes(object.sizeBytes)} · {object.mimeType}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[11.5px] text-muted">
            {formatDate(object.createdAt)}
          </span>
          <a
            href={object.publicUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[12px] font-semibold text-ink-soft hover:bg-surface-hover"
          >
            Open
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>
  );
}
