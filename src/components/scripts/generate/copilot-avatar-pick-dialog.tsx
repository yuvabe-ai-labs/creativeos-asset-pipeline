"use client";

import { useState } from "react";
import { Search, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { matchingAvatarOptions, type AvatarOption, type AvatarPick } from "@/lib/scripts/copilot/suggestions";

/** D474 — the client's avatars, as faces to search and choose from, instead of one chip each. */
export function CopilotAvatarPickDialog({ pick, open, onOpenChange, onChoose }: {
  pick: AvatarPick;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (option: AvatarOption) => void;
}) {
  const [query, setQuery] = useState("");
  const options = matchingAvatarOptions(pick.options, query);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{pick.title}</DialogTitle>
          <DialogDescription>Choose one of this client&apos;s avatars.</DialogDescription>
        </DialogHeader>
        <InputGroup>
          <InputGroupAddon>
            <Search strokeWidth={1.5} />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search avatars"
            placeholder="Search by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </InputGroup>
        {options.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No avatars match that name.</p>
        ) : (
          <ul className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto p-0.5 sm:grid-cols-3 md:grid-cols-4">
            {options.map((option) => (
              <li key={option.id}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    onChoose(option);
                    onOpenChange(false);
                    setQuery("");
                  }}
                  className="h-auto w-full flex-col items-stretch gap-0 overflow-hidden whitespace-normal rounded-lg border border-border p-0 text-left hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="relative flex aspect-3/4 items-center justify-center bg-muted">
                    {option.front ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={option.front} alt="" loading="lazy" className="absolute inset-0 size-full object-cover object-top" />
                    ) : (
                      <UserRound className="size-8 text-muted-foreground" strokeWidth={1.5} />
                    )}
                    {option.suggested && (
                      <Badge variant="outline" className="absolute top-1.5 left-1.5 bg-card">Suggested</Badge>
                    )}
                  </span>
                  {/* Two lines kept for every name, so a long one doesn't make its tile taller. */}
                  <span className="box-content line-clamp-2 min-h-[2lh] px-2.5 py-2 text-sm font-medium" title={option.label}>{option.label}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
