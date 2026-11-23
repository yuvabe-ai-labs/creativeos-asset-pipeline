import { isLongText } from "@/lib/scripts/copilot/message-text";
import { cn } from "@/lib/utils";

/** The person's words, in any copilot panel. A long paste shows its first lines, fading out, as in
 *  the message box. */
export function PersonText({ content }: { content: string }) {
  const long = isLongText(content);
  return (
    <div
      data-clipped={long}
      className={cn(
        "max-w-[92%] whitespace-pre-wrap rounded-2xl bg-muted px-3.5 py-2.5 text-sm leading-relaxed",
        long && "max-h-40 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]",
      )}
    >
      {content}
    </div>
  );
}
