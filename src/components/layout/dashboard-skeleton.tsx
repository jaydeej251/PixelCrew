"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="flex h-dvh flex-col bg-zinc-950">
      <div className="flex h-12 items-center gap-3 border-b border-zinc-800 px-4">
        <Skeleton className="h-7 w-7 rounded-md" />
        <Skeleton className="h-4 w-28" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-56 space-y-2 border-r border-zinc-800 p-3 lg:block">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <div className="flex flex-1 items-center justify-center bg-[#243348]">
          <Skeleton className="h-48 w-80 rounded-xl bg-zinc-800/40" />
        </div>
      </div>
    </div>
  );
}
