import { Button } from "@/components/ui/button";
import type { Suggestion } from "@/lib/scripts/copilot/suggestions";

/** One-tap suggestions under the copilot's newest message: send at once, or fill the box to finish by hand. */
export function CopilotSuggestions({ suggestions, onSend, onFill }: {
  suggestions: Suggestion[];
  onSend: (text: string, leadAvatarId?: string) => void;
  onFill: (text: string) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div aria-label="Suggestions" className="-mt-1 flex flex-wrap gap-1.5 px-4 pb-4">
      {suggestions.map((s) => (
        <Button
          key={s.label}
          variant="outline"
          size="xs"
          className="h-auto max-w-full whitespace-normal rounded-full border-dashed border-primary/40 py-1 text-left text-primary hover:bg-primary/5"
          onClick={() => (s.send ? onSend(s.text, s.leadAvatarId) : onFill(s.text))}
        >
          {s.label}
        </Button>
      ))}
    </div>
  );
}
