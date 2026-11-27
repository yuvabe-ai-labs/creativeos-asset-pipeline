"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePayNow } from "@/hooks/queries/billing";
import { ApiError } from "@/services/read-json";

// Pays a due plan payment (D585): opens the payment page in a new tab; the page updates once it
// goes through.
export function PayNowButton() {
  const payNow = usePayNow();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={payNow.isPending}
        onClick={async () => {
          setError(null);
          try {
            const { url } = await payNow.mutateAsync();
            window.open(url, "_blank", "noopener");
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not open the payment page.");
          }
        }}
      >
        {payNow.isPending ? "Opening…" : "Pay now"}
      </Button>
      {error && <p className="text-sm text-destructive" role="status">{error}</p>}
    </div>
  );
}
