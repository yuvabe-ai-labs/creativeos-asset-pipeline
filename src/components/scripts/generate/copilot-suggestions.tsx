import { Button } from "@/components/ui/button";
import type { Suggestion } from "@/lib/scripts/copilot/suggestions";

/** One-tap suggestions above the message box: send at once, or fill the box to finish by hand. */
export function CopilotSuggestions({ suggestions, disabled, onSend, onFill }: {
  suggestions: Suggestion[];
  disabled: boolean;
  onSend: (text: string) => void;
  onFill: (text: string) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div aria-label="Suggestions" className="flex flex-wrap gap-1.5 px-3 pt-3">
      {suggestions.map((s) => (
        <Button
          key={s.label}
          variant="outline"
          size="xs"
          disabled={disabled}
          className="h-auto max-w-full whitespace-normal rounded-full border-dashed border-primary/40 py-1 text-left text-primary hover:bg-primary/5"
          onClick={() => (s.send ? onSend(s.text) : onFill(s.text))}
        >
          {s.label}
        </Button>
      ))}
    </div>
  );
}
