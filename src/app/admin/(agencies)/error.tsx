"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgenciesState } from "@/components/admin/agencies/agencies-state";

// A failed load never looks like an empty list (D590). unstable_retry (not reset) re-fetches the
// server-rendered page; reset() would only re-render the same failed result (Next 16 docs,
// file-conventions/error).
export default function AgenciesError({
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
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <h1 className="font-display mb-5 text-2xl font-semibold tracking-tight">Agencies</h1>
      <div className="rounded-xl border bg-card shadow-card">
        <AgenciesState
          title="Couldn't load agencies"
          actions={
            <Button variant="outline" onClick={() => unstable_retry()}>
              <RefreshCw strokeWidth={1.5} />
              Try again
            </Button>
          }
        >
          Check your connection and try again.
        </AgenciesState>
      </div>
    </main>
  );
}
