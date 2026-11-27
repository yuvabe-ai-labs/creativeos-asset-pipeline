"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { adminPageClass } from "@/components/admin/admin-page";

// A failed load must never read as an empty catalog. unstable_retry (not reset) fetches the
// server-rendered page again (Next 16 docs, file-conventions/error).
export default function ModelsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={adminPageClass()}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Models</h1>
      <div className="mt-5 flex flex-col items-start gap-3 rounded-xl border bg-card px-5 py-6 shadow-card">
        <p className="text-sm font-semibold">The models couldn&apos;t be loaded.</p>
        <p className="text-sm text-muted-foreground">Nothing has changed. Try again in a moment.</p>
        <Button variant="outline" size="sm" onClick={() => unstable_retry()}>
          Try again
        </Button>
      </div>
    </main>
  );
}
