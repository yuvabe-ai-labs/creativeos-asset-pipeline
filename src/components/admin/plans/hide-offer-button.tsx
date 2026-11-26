"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { setOfferShownAction } from "@/lib/actions/billing-catalog";
import type { CatalogProduct } from "@/lib/billing/catalog";

const plain = (n: number) => n.toLocaleString("en-IN");

// Hide or show an offer for new purchases. Hiding one that agencies are on asks first, and says
// that they keep it (D592). Showing again, or hiding one nobody is on, happens at once.
export function HideOfferButton({ product, agencies }: { product: CatalogProduct; agencies: number }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const shown = product.active;

  async function toggle(): Promise<boolean> {
    setBusy(true);
    const result = await setOfferShownAction({ productId: product.id, kind: product.kind, name: product.name, description: product.description, shown: !shown });
    setBusy(false);
    if (result.error) toast.error(result.error);
    return !result.error;
  }

  const button = (
    <Button variant="ghost" size="sm" disabled={busy} onClick={shown && agencies > 0 ? undefined : () => void toggle()}>
      {shown ? <EyeOff aria-hidden strokeWidth={1.5} /> : <Eye aria-hidden strokeWidth={1.5} />}
      {shown ? "Hide" : "Show"}
    </Button>
  );
  if (!shown || agencies === 0) return button;

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <AlertDialogTrigger render={button} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hide {product.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            It leaves the plans page agencies see, so no one new can choose it.{" "}
            {agencies === 1 ? "The agency on it keeps it and keeps renewing until it changes plan." : `The ${plain(agencies)} agencies on it keep it and keep renewing until they change plan.`}{" "}
            You can show it again any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void toggle().then((ok) => ok && setOpen(false))} disabled={busy}>
            {busy ? "Hiding…" : `Hide ${product.name}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
