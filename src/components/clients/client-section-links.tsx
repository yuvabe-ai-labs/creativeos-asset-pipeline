import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CLIENT_SECTIONS } from "@/components/clients/client-sections";

const PINNED = CLIENT_SECTIONS.filter((s) => s.pinned);

/**
 * A tile's action row: the pinned sections (Scripts, Avatars) as labelled links, so the
 * client's two working surfaces are one click from home. The other sections sit in the
 * tile's ⋯ menu. Each action takes an equal share of the row, split by a hairline.
 */
export function ClientSectionLinks({ slug, clientName }: { slug: string; clientName: string }) {
  return (
    <nav
      aria-label={`${clientName} sections`}
      className="flex items-stretch divide-x border-t"
    >
      {PINNED.map((section) => (
        <Button
          key={section.label}
          variant="ghost"
          size="sm"
          nativeButton={false}
          className="h-10 flex-1 rounded-none gap-1.5 text-primary first:rounded-bl-xl last:rounded-br-xl hover:bg-primary/5 hover:text-primary"
          render={<Link href={section.href(slug)} />}
        >
          <section.icon className="size-4" strokeWidth={1.5} />
          {section.label}
        </Button>
      ))}
    </nav>
  );
}
