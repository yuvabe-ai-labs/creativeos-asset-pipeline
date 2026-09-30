"use client";

import { Check, Circle, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AVATAR_NAME_MAX, AVATAR_STORY_MAX, PERSON_TYPE_LABELS, READINESS_GAP_LABELS,
} from "@/lib/avatars/constants";
import { avatarEngineNote } from "@/lib/avatars/generation";
import type { Avatar } from "@/lib/avatars/schema";
import type { ReadinessGap } from "@/lib/avatars/utils";
import { AvatarArchiveButton } from "./avatar-archive-button";
import { AvatarCreditCost } from "./avatar-credit-cost";

type Props = {
  avatar: Avatar | null;
  name: string;
  story: string;
  gaps: ReadinessGap[];
  saving: boolean;
  spentCredits: number;
  onName: (value: string) => void;
  onStory: (value: string) => void;
  onSave: () => void;
  onArchive: () => void;
};

function Row({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  const Icon = done ? Check : Circle;
  return (
    <li className="flex items-center gap-2.5 border-b py-2 text-sm last:border-b-0">
      <Icon
        className={done ? "size-4 text-primary" : "size-4 text-muted-foreground/50"}
        strokeWidth={1.5}
      />
      <span className="flex-1">{label}</span>
      <span className="max-w-[60%] text-right text-xs text-muted-foreground">{detail}</span>
    </li>
  );
}

// The Studio's right-hand card: what the avatar is so far, its name and story, and Save. It
// fills in as the steps are completed, so the operator always sees what they are saving.
export function AvatarStudioCard({
  avatar, name, story, gaps, saving, spentCredits, onName, onStory, onSave, onArchive,
}: Props) {
  const has = (gap: ReadinessGap) => !gaps.includes(gap);
  const engine = avatar ? avatarEngineNote(avatar) : null;

  return (
    <Card className="sticky top-6 flex flex-col gap-3 self-start p-4 shadow-card">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        {avatar?.front ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar.front.url} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center">
            <UserRound className="size-10 text-muted-foreground/40" strokeWidth={1.5} />
          </span>
        )}
        {avatar?.status === "ready" && (
          <Badge className="absolute left-2 top-2 bg-card">Ready</Badge>
        )}
      </div>

      <ul>
        <Row done={has("front")} label="Front image" detail={has("front") ? "Added" : "Needed"} />
        <Row
          done={has("sheet") && has("sheet-stale")}
          label="Profile sheet"
          detail={!has("sheet") ? "Needed" : !has("sheet-stale") ? "Out of date" : "Added"}
        />
        {avatar?.front && avatar.personType && (
          <Row done label="Person type" detail={PERSON_TYPE_LABELS[avatar.personType]} />
        )}
        {avatar?.front?.source.kind === "upload" && (
          <Row done={has("consent")} label="Permission" detail={has("consent") ? "Confirmed" : "Needed"} />
        )}
        {engine && <Row done label="Runs on" detail={engine} />}
      </ul>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="avatar-name">Name</Label>
        <Input
          id="avatar-name"
          value={name}
          maxLength={AVATAR_NAME_MAX}
          placeholder="e.g. Riya"
          onChange={(e) => onName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="avatar-story">Background story (optional)</Label>
        <Textarea
          id="avatar-story"
          value={story}
          maxLength={AVATAR_STORY_MAX}
          rows={4}
          placeholder="Who they are, how they speak, what they care about"
          onChange={(e) => onStory(e.target.value)}
        />
      </div>

      <Button disabled={gaps.length > 0 || saving} onClick={onSave}>
        {saving ? "Saving…" : "Save avatar"}
      </Button>
      {gaps.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Still needed: {gaps.map((g) => READINESS_GAP_LABELS[g]).join(", ")}.
        </p>
      )}

      {spentCredits > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          Spent on this avatar
          <AvatarCreditCost credits={spentCredits} />
        </p>
      )}

      {avatar && <AvatarArchiveButton name={name} onArchive={onArchive} />}
    </Card>
  );
}
