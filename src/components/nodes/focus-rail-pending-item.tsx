import { Loader2 } from "lucide-react";

// A just-connected input the server still has to list (D482): an avatar or product becomes several
// images and a prompt node needs its rendered text, so only the confirming read can draw it. Sized
// like RailItem so the row it becomes does not shift the list. Not a control: nothing to act on yet.
export function RailPendingItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 text-sm text-muted-foreground" aria-busy="true">
      <span className="flex w-4 shrink-0 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-primary" strokeWidth={1.5} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </div>
  );
}
