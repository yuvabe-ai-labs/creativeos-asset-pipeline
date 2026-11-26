"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgenciesState } from "@/components/admin/agencies/agencies-state";
import { adminPageClass } from "@/components/admin/admin-page";

// A failed load never reads as "no change scheduled" or default settings (D594). unstable_retry (not
// reset) fetches the server-rendered page again (Next 16 docs, file-conventions/error).
export default function CreditsError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={adminPageClass()}>
      <h1 className="font-display mb-5 text-2xl font-semibold tracking-tight">Credits</h1>
      <div className="max-w-4xl rounded-xl border bg-card shadow-card">
        <AgenciesState
          title="Couldn't load the credit settings"
          actions={
            <Button variant="outline" onClick={() => unstable_retry()}>
              <RefreshCw strokeWidth={1.5} />
              Try again
            </Button>
          }
        >
          Nothing has changed. Try again in a moment.
        </AgenciesState>
      </div>
    </main>
  );
}
