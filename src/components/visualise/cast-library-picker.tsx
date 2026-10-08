"use client";

import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLibraryAvatars } from "@/hooks/queries/avatars";
import { hasFourViews } from "@/lib/avatars/utils";

// Spec §5.2 — pick an existing avatar from the library (saved ones only: drafts are not offered).
// Avatars another person in this script already has are left out (one face per person).
export function CastLibraryPicker({ clientId, excludeIds, disabled, onPick }: {
  clientId: string;
  excludeIds: string[];
  disabled: boolean;
  onPick: (avatarId: string) => void;
}) {
  const library = useLibraryAvatars(clientId);
  const options = (library.data ?? []).filter((a) => !excludeIds.includes(a.id));
  return (
    <Select value="" onValueChange={(v) => { if (typeof v === "string" && v) onPick(v); }} disabled={disabled || options.length === 0}>
      <SelectTrigger size="sm" className="min-w-44" aria-label="Pick from library">
        <SelectValue>Pick from library</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            <span className="flex items-center gap-2">
              {a.front ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.front.url} alt="" className="size-6 rounded object-cover" />
              ) : (
                <UserRound className="size-4 text-muted-foreground" strokeWidth={1.5} />
              )}
              {a.name}
              {!hasFourViews(a) && <Badge variant="outline">Needs four views</Badge>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
