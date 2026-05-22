export function UsersSkeleton() {
  return (
    <div className="divide-y divide-border">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex items-center gap-4 px-5 py-3.5">
          <div className="h-8 w-8 animate-pulse rounded-full bg-surface-hover" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 animate-pulse rounded bg-surface-hover" />
            <div className="h-2.5 w-24 animate-pulse rounded bg-surface-hover" />
          </div>
          <div className="h-5 w-12 animate-pulse rounded-md bg-surface-hover" />
          <div className="h-5 w-16 animate-pulse rounded-md bg-surface-hover" />
        </div>
      ))}
    </div>
  );
}
