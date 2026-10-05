"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ClientBrandImageRow } from "@/lib/db/types";

type Props = {
  /** The asset waiting for confirmation, or null when closed. */
  asset: ClientBrandImageRow | null;
  onConfirm: (asset: ClientBrandImageRow) => void;
  onCancel: () => void;
};

/** Confirms deleting one brand asset — from a grid tile or from the lightbox. */
export function DeleteAssetDialog({ asset, onConfirm, onCancel }: Props) {
  const kind = asset?.media_type === "video" ? "video" : "image";
  return (
    <AlertDialog open={asset !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this {kind}?</AlertDialogTitle>
          <AlertDialogDescription>
            It is removed from the brand assets and its stored file is deleted. A Refresh can import
            it again if it is still on the {asset?.source === "website" ? "website" : "brand's profile"}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => asset && onConfirm(asset)}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
