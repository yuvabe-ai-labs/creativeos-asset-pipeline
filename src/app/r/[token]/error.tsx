"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Same closed-door tone as not-found.tsx: the client sees no stack or server wording.
// unstable_retry (not reset) re-fetches the server-rendered page — reset() would only
// re-render the same failed result (Next 16 docs, file-conventions/error).
export default function ReviewError({
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-3 px-6">
      <p className="text-eyebrow text-muted-foreground">Yuvabe Studios</p>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Something went wrong loading this review.
      </h1>
      <p className="text-sm text-muted-foreground">Try again in a moment.</p>
      <Button variant="outline" onClick={() => unstable_retry()} className="self-start">
        Try again
      </Button>
    </main>
  );
}
