"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { useTurnTrace } from "@/hooks/queries/copilot-traces";
import type { TurnTrace } from "@/lib/journey/kb-copilot/trace";
import { asJson, TraceSection, TraceText } from "./trace-parts";

const isRefusal = (output: string, refusals: string[]) => output.startsWith("Error:") || refusals.includes(output);

/** One turn's whole trace, in the order of spec §3.1. Loaded when it is opened. */
export function TurnTraceView({ clientId, traceId }: { clientId: string; traceId: string }) {
  const query = useTurnTrace(clientId, traceId);
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-2 py-2" aria-label="Loading the trace">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    );
  }
  if (query.isError) return <p className="py-2 text-xs text-destructive">{query.error.message}</p>;
  return <TraceBody trace={query.data.trace} />;
}

function TraceBody({ trace }: { trace: TurnTrace }) {
  const { came, sent, rounds, choice, refusals, code } = trace;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-3 text-sm">
      <TraceSection label="What came in">
        <TraceText>{came.text || "(no words)"}</TraceText>
        {came.attachments.length > 0 && <p className="text-xs text-muted-foreground">Attached: {came.attachments.map((a) => `${a.name} (${a.kind})`).join(", ")}</p>}
        <p className="text-xs text-muted-foreground">Waiting question: {came.waiting ?? "none"} · State: {came.state}</p>
      </TraceSection>

      <TraceSection label="What the agent was given">
        {sent ? (
          <>
            <p className="text-xs text-muted-foreground">Model: {trace.model ?? "unknown"}</p>
            <Accordion>
              <AccordionItem value="instructions">
                <AccordionTrigger className="text-xs">Instructions</AccordionTrigger>
                <AccordionContent><TraceText>{sent.system}</TraceText></AccordionContent>
              </AccordionItem>
              <AccordionItem value="conversation">
                <AccordionTrigger className="text-xs">Conversation ({sent.messages.length} messages)</AccordionTrigger>
                <AccordionContent><TraceText>{sent.messages.map((m) => `${m.role}: ${m.content}`).join("\n\n")}</TraceText></AccordionContent>
              </AccordionItem>
              <AccordionItem value="tools">
                <AccordionTrigger className="text-xs">Tools ({sent.tools.length})</AccordionTrigger>
                <AccordionContent><TraceText>{asJson(sent.tools)}</TraceText></AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No model was asked: a reply button, carried out by code.</p>
        )}
      </TraceSection>

      {choice && (
        <TraceSection label="Carried out by code">
          <p className="text-xs">{choice.tool}</p>
          <TraceText tone={isRefusal(choice.output, refusals) ? "refused" : undefined}>{choice.output}</TraceText>
        </TraceSection>
      )}

      {rounds.map((round, i) => (
        <TraceSection key={i} label={`Round ${i + 1} · ${round.ms} ms`}>
          {round.text ? <TraceText>{round.text}</TraceText> : <p className="text-xs text-muted-foreground">No words.</p>}
          {round.calls.length === 0 && <p className="text-xs text-muted-foreground">No tool called.</p>}
          {round.calls.map((call) => {
            const result = round.results.find((r) => r.id === call.id);
            return (
              <div key={call.id} className="flex flex-col gap-1">
                <p className="text-xs font-medium">{call.name}</p>
                <TraceText>{asJson(call.args)}</TraceText>
                {result
                  ? <TraceText tone={isRefusal(result.output, refusals) ? "refused" : undefined}>{result.output}</TraceText>
                  : <p className="text-xs text-muted-foreground">Not run.</p>}
              </div>
            );
          })}
        </TraceSection>
      ))}

      <TraceSection label="What code did">
        <p className="text-xs">Fields written: {code.settled.length > 0 ? code.settled.join(", ") : "none"}</p>
        {code.added.length > 0 && <TraceText>{code.added.join("\n\n")}</TraceText>}
        {code.card && <p className="text-xs">A change card followed the reply.</p>}
      </TraceSection>

      <TraceSection label={`How it ended · ${(trace.ms / 1000).toFixed(1)} s`}>
        <TraceText>{trace.reply || "(no reply stored)"}</TraceText>
        {trace.error && <TraceText tone="refused">{trace.error}</TraceText>}
      </TraceSection>
    </div>
  );
}
