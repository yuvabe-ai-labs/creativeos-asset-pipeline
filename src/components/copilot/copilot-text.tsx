import { messageParagraphs } from "@/lib/scripts/copilot/message-text";

/** The copilot's words, in any copilot panel. Its question stands out from the rest of the message
 *  (one size up, medium weight), with the hint after it back at body size. */
export function CopilotText({ content }: { content: string }) {
  return (
    <div className="flex max-w-[92%] flex-col gap-3 px-0.5 text-sm leading-relaxed">
      {messageParagraphs(content).map((p, i) =>
        p.kind === "question" ? (
          <div key={i} className="flex flex-col gap-0.5">
            <p className="text-base font-medium leading-snug text-foreground">{p.question}</p>
            {p.hint && <p className="whitespace-pre-wrap text-muted-foreground">{p.hint}</p>}
          </div>
        ) : (
          <p key={i} className="whitespace-pre-wrap">{p.text}</p>
        ),
      )}
    </div>
  );
}
