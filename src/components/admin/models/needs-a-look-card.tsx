import Link from "next/link";
import { CalendarDays, Info, TriangleAlert, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AttentionItem } from "@/lib/admin/models-list";

function ItemIcon({ item }: { item: AttentionItem }) {
  const Icon = item.tone === "bad" ? TriangleAlert : item.tone === "info" ? Info : item.modelId ? CalendarDays : Wallet;
  return (
    <Icon
      aria-hidden
      strokeWidth={1.5}
      className={cn(
        "size-4 shrink-0",
        item.tone === "bad" ? "text-destructive-text" : item.tone === "next" ? "text-primary" : "text-muted-foreground",
      )}
    />
  );
}

/** "Kling 3.1 Omni has no price yet" reads on; "Omni: prices drop 31%" and "Omni: Its price fails its check" take a colon. */
const needsColon = (item: AttentionItem) => item.tone === "next" || /^[A-Z]/.test(item.text);

/** Problems and scheduled changes above the models list. Nothing when there are none. */
export function NeedsALookCard({ items }: { items: AttentionItem[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="needs-a-look" className="mb-5 overflow-hidden rounded-xl border bg-card shadow-card">
      <h2 id="needs-a-look" className="px-4 pt-3.5 pb-1.5 text-sm font-semibold">
        Needs a look <span className="font-medium text-muted-foreground">{items.length}</span>
      </h2>
      <ul>
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 border-t px-4 py-2.5 text-[0.8125rem] first:border-t-0">
            <ItemIcon item={item} />
            <p className="min-w-0 flex-1">
              <span className="font-semibold">
                {item.name ? `${item.name}${needsColon(item) ? ":" : ""} ` : ""}
              </span>
              <span className={item.name ? "" : "font-semibold"}>{item.text}</span>
              <span className="text-muted-foreground">. {item.detail}</span>
            </p>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={item.href} prefetch={false} aria-label={`${item.action}: ${item.name ?? item.text}`} />}
            >
              {item.action}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
