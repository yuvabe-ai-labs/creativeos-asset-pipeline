import { cn } from "@/lib/utils";

// Placeholder figure for an avatar with no image yet: a round head over an arched body, as in
// the Avatars sketch. Sits on the bottom edge of its box.
export function AvatarSilhouette({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 150"
      aria-hidden
      className={cn("text-muted-foreground/30", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      preserveAspectRatio="xMidYMax meet"
    >
      <circle cx="60" cy="48" r="16" />
      <path d="M30 150 V112 C30 90 43 78 60 78 C77 78 90 90 90 112 V150" />
    </svg>
  );
}
