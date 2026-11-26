import { describe, it, expect, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { AlertDialogAction } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { GenerateAllPlan } from "@/lib/scripts/visualise/state";

// Open the dialog without a DOM: the component's one useState is "open".
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => [typeof initial === "boolean" ? true : initial, vi.fn()],
}));

import { GenerateAllDialog } from "../generate-all-dialog";

const plan = (credits: number | null): GenerateAllPlan => ({ shotIds: ["s1", "s2"], credits, redraw: false, waiting: 0 });

type Props = { disabled?: boolean; children?: ReactNode };
function find(node: ReactNode, type: unknown, out: ReactElement<Props>[] = []): ReactElement<Props>[] {
  if (Array.isArray(node)) node.forEach((n) => find(n, type, out));
  else if (node && typeof node === "object" && "props" in node) {
    const el = node as ReactElement<Props>;
    if (el.type === type) out.push(el);
    find(el.props.children, type, out);
  }
  return out;
}

const tree = (credits: number | null) => GenerateAllDialog({ plan: plan(credits), busy: false, onConfirm: vi.fn() });

describe("GenerateAllDialog (paid action waits for the price)", () => {
  it("disables the trigger and the confirm while the total is unknown", () => {
    const t = tree(null);
    expect(find(t, Button)[0].props.disabled).toBe(true);
    expect(find(t, AlertDialogAction)[0].props.disabled).toBe(true);
  });

  it("enables both once the total is known", () => {
    const t = tree(603);
    expect(find(t, Button)[0].props.disabled).toBe(false);
    expect(find(t, AlertDialogAction)[0].props.disabled).toBe(false);
  });
});
