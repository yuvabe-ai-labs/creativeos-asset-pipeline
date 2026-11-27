"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { USAGE_PAGE_CLASS } from "@/lib/billing/constants";

// A failed load never reads as "nothing used" or "no credits" (D597). unstable_retry (not reset)
// fetches the server-rendered page again (Next 16 docs, file-conventions/error).
export default function UsageError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={USAGE_PAGE_CLASS}>
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">Usage</h1>
      <Card className="items-center gap-1.5 px-4 py-14 text-center text-sm text-muted-foreground shadow-card" role="alert">
        <h2 className="font-display text-base font-semibold text-foreground">Usage couldn&apos;t be loaded</h2>
        <p>Nothing has changed. Try again in a moment.</p>
        <Button className="mt-2.5" variant="outline" onClick={() => unstable_retry()}>
          <RefreshCw strokeWidth={1.5} />
          Try again
        </Button>
      </Card>
    </main>
  );
}
