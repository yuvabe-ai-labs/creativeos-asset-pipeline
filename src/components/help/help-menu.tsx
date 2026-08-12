"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { CircleHelp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { visibleChapters, chapterBySlug } from "@/lib/help/chapters";
import { parseHelpParams, helpParamsFor } from "@/lib/help/deep-link";
import { HelpChapterDialog } from "@/components/help/help-chapter-dialog";

// Pull-based onboarding (D102): the user opens this, nothing is ever pushed at them.
// Chapter + step live in the URL so a chapter is linkable, shareable and back-button
// friendly — and so this component derives its state during render rather than in an
// effect (react-hooks/set-state-in-effect).
export function HelpMenu() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const location = parseHelpParams(new URLSearchParams(searchParams.toString()));
  const chapter = location ? (chapterBySlug(location.slug) ?? null) : null;

  const chapters = visibleChapters();
  const howTo = chapters.filter((c) => c.question.startsWith("How"));
  const why = chapters.filter((c) => !c.question.startsWith("How"));

  // history.pushState, not router.push. In the App Router a router.push is a navigation
  // even when only the query changes, so opening a chapter — and every Back/Next inside
  // it — refetches the RSC payload and re-runs the whole page's server components. On a
  // heavy route like the KB page that is seconds of lag for what is purely client state.
  // Next patches the native history methods into its own router (see its
  // single-page-applications guide), so usePathname/useSearchParams still update and the
  // URL stays deep-linkable and shareable — without touching the server.
  const openAt = (slug: string, step: number) =>
    window.history.pushState(null, "", `${pathname}${helpParamsFor(slug, step)}`);

  const close = () => window.history.pushState(null, "", pathname);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm">
              <CircleHelp className="size-4" strokeWidth={1.5} />
              Help
              <ChevronDown className="size-3.5" strokeWidth={1.5} />
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuGroupLabel>How do I…</DropdownMenuGroupLabel>
            {howTo.map((c) => (
              <DropdownMenuItem key={c.slug} onClick={() => openAt(c.slug, 1)}>
                {c.question}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuGroupLabel>Why…</DropdownMenuGroupLabel>
            {why.map((c) => (
              <DropdownMenuItem key={c.slug} onClick={() => openAt(c.slug, 1)}>
                {c.question}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <HelpChapterDialog
        chapter={chapter}
        step={location?.step ?? 1}
        onStepChange={(step) => chapter && openAt(chapter.slug, step)}
        onClose={close}
      />
    </>
  );
}
