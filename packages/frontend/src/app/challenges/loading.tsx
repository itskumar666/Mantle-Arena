export default function ChallengesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-36 bg-white/10 rounded animate-pulse" />
          <div className="h-4 w-64 bg-white/5 rounded animate-pulse" />
        </div>
        <div className="h-4 w-16 bg-white/5 rounded animate-pulse" />
      </div>
      <div className="h-10 w-72 bg-white/5 rounded-lg animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border border-white/10 rounded-lg p-5 space-y-4 animate-pulse">
            <div className="flex justify-between">
              <div className="h-5 w-32 bg-white/10 rounded" />
              <div className="h-5 w-16 bg-white/10 rounded-full" />
            </div>
            <div className="flex gap-2">
              <div className="h-5 w-14 bg-white/5 rounded-full" />
              <div className="h-5 w-14 bg-white/5 rounded-full" />
              <div className="h-5 w-14 bg-white/5 rounded-full" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="space-y-1">
                  <div className="h-3 w-20 bg-white/5 rounded" />
                  <div className="h-4 w-24 bg-white/10 rounded" />
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <div className="h-3 w-24 bg-white/5 rounded" />
              <div className="h-7 w-16 bg-white/5 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
