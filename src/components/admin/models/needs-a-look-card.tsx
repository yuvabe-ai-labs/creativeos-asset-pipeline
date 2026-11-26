import Link from "next/link";
import { CalendarDays, Info, TriangleAlert, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddChip } from "@/components/admin/models/add-chip";
import { cn } from "@/lib/utils";
import type { AttentionItem } from "@/lib/admin/models-list";

const ICON_CLASS: Record<AttentionItem["tone"], string> = {
  bad: "text-destructive-text",
  warn: "text-warning-text",
  info: "text-muted-foreground",
  next: "text-muted-foreground",
};

function ItemIcon({ item }: { item: AttentionItem }) {
  const Icon = item.tone === "bad" || item.tone === "warn" ? TriangleAlert : item.tone === "info" ? Info : item.modelId ? CalendarDays : Wallet;
  return <Icon aria-hidden strokeWidth={1.5} className={cn("size-4 shrink-0", ICON_CLASS[item.tone])} />;
}

/** "Kling 3.1 Omni has no price yet" reads on; "Omni: prices drop 31%" takes a colon. */
const needsColon = (item: AttentionItem) => item.tone === "next" || /^[A-Z]/.test(item.text);

/**
 * Problems and scheduled changes above an admin list (Models, Plans and prices, Payments), one line
 * and one action each. Nothing when there are none. The action links to `href`, unless
 * `renderAction` gives an item its own control (a dialog that opens in place).
 */
export function NeedsALookCard({ items, renderAction }: { items: AttentionItem[]; renderAction?: (item: AttentionItem) => React.ReactNode }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="needs-a-look" className="mb-5 overflow-hidden rounded-xl border bg-card shadow-card">
      <h2 id="needs-a-look" className="border-b px-4 py-2.5 text-sm font-semibold">
        Needs a look <span className="font-medium text-muted-foreground">{items.length}</span>
      </h2>
      <ul>
        {items.map((item) => {
          const link = <Link href={item.href} prefetch={false} aria-label={`${item.action}: ${item.name ?? item.text}`} />;
          return (
            <li key={item.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/60 px-4 py-2.5 text-[0.8125rem] first:border-t-0 sm:flex-nowrap">
              <ItemIcon item={item} />
              <p className="min-w-0 flex-1 basis-[calc(100%-2rem)] sm:basis-auto">
                <span className="font-semibold">
                  {item.name ? `${item.name}${needsColon(item) ? ":" : ""} ` : ""}
                </span>
                <span className={item.name ? "" : "font-semibold"}>{item.text}.</span>
                {item.detail && <span className="text-muted-foreground"> {item.detail}</span>}
              </p>
              <span className="max-sm:ml-7">
                {renderAction ? (
                  renderAction(item)
                ) : item.action === "Add prices" ? (
                  <AddChip label={item.action} nativeButton={false} render={link} />
                ) : (
                  <Button variant="outline" size="sm" nativeButton={false} render={link}>
                    {item.action}
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
