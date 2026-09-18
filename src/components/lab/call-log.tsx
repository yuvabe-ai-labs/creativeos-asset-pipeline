"use client";

// EXPERIMENT (throwaway) — raw request/response panel.
// The point of the probe is to see WHICH moderation error fires, so responses are
// shown untouched rather than mapped to friendly copy.

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type LoggedCall = {
  label: string;
  payload: unknown;
  at: string;
};

export function CallLog({ calls }: { calls: LoggedCall[] }) {
  return (
    <Card className="h-fit space-y-3 p-5 lg:sticky lg:top-6">
      <div className="flex items-center justify-between">
        <span className="text-eyebrow">Call log</span>
        {calls.length > 0 && <Badge variant="secondary">{calls.length}</Badge>}
      </div>

      {calls.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Raw ModelArk requests and responses appear here — including moderation
          rejections and their error codes.
        </p>
      ) : (
        <div className="space-y-3">
          {calls.map((call, i) => (
            <div key={`${call.at}-${i}`} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-neutral-900">{call.label}</span>
                <span className="text-xs text-neutral-500">
                  {new Date(call.at).toLocaleTimeString()}
                </span>
              </div>
              <pre className="max-h-64 overflow-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-[11px] leading-relaxed text-neutral-700">
                {JSON.stringify(call.payload, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
