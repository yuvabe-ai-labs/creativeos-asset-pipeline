import Link from "next/link";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "kb", label: "Brand KB", path: "kb" },
  { key: "market", label: "Market", path: "market" },
] as const;

/** The client workspace's section switcher — plain links (navigation, not controls),
 *  server-component friendly (active state via prop, no hooks). */
export function ClientSectionNav({ slug, active }: { slug: string; active: "kb" | "market" }) {
  return (
    <nav className="mb-6 flex gap-1 border-b border-border">
      {SECTIONS.map((s) => (
        <Link
          key={s.key}
          href={`/clients/${slug}/${s.path}`}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-200",
            active === s.key
              ? "border-primary font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
