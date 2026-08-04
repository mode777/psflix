export function ConsoleSkeleton() {
  return (
    <main className="h-[calc(100vh-80px)] flex flex-col p-8 gap-6 animate-pulse motion-reduce:animate-none">
      <div className="flex justify-between items-center">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-64 rounded bg-surface-container" />
          <div className="h-3 w-40 rounded bg-surface-container" />
        </div>
        <div className="h-7 w-32 rounded-full bg-surface-container" />
      </div>
      <div className="flex-1 flex gap-8 min-h-0">
        <div className="flex-[3] rounded-xl bg-surface-container/50 border border-white/5" />
        <div className="w-96 rounded-xl bg-surface-container/50 border border-white/5" />
      </div>
    </main>
  );
}
