import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format/initials";

const SIZES = {
  sm: "size-8 text-[0.7rem]",
  md: "size-11 text-sm",
} as const;

// A person's initials in a neutral circle. The owner gets a faint brand ring, the only colour.
// Someone only invited has no name yet: a dashed circle with a mail glyph.
export function PersonAvatar({
  name,
  size = "sm",
  owner = false,
  invited = false,
}: {
  name: string;
  size?: keyof typeof SIZES;
  owner?: boolean;
  invited?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-medium tracking-wide",
        SIZES[size],
        invited ? "border border-dashed border-muted-foreground/40 text-muted-foreground" : "bg-secondary text-foreground/75",
        owner && "ring-2 ring-primary/35 ring-offset-2 ring-offset-card",
      )}
    >
      {invited ? <Mail className="size-3.5" strokeWidth={1.5} /> : initials(name) || "?"}
    </span>
  );
}
