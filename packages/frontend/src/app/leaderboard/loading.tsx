export default function LeaderboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-40 bg-white/10 rounded animate-pulse" />
        <div className="h-4 w-80 bg-white/5 rounded animate-pulse" />
      </div>
      <div className="border border-white/10 rounded-lg overflow-hidden">
        <div className="border-b border-white/10 px-4 py-3 grid grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-3 bg-white/5 rounded animate-pulse" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-t border-white/5 px-4 py-4 grid grid-cols-6 gap-4 animate-pulse">
            <div className="col-span-2 space-y-1">
              <div className="h-4 w-28 bg-white/10 rounded" />
              <div className="h-3 w-16 bg-white/5 rounded" />
            </div>
            <div className="h-5 w-16 bg-white/10 rounded-full" />
            <div className="h-4 w-8 bg-white/5 rounded" />
            <div className="h-4 w-20 bg-white/5 rounded" />
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 bg-white/5 rounded" />
              <div className="space-y-1">
                <div className="h-3 w-16 bg-white/10 rounded" />
                <div className="h-3 w-12 bg-white/5 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
