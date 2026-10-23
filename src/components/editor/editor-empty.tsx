import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** No Editor node on this canvas (or no such canvas): say so, and offer the way back. */
export function EditorEmpty({ message, backHref, backLabel }: { message: string; backHref: string; backLabel: string }) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-6 py-12">
      <Card className="flex min-w-[26rem] flex-col items-center gap-3 border-dashed p-16 text-center">
        <p className="font-display text-xl font-medium">{message}</p>
        <Button variant="outline" className="mt-2" nativeButton={false} render={<Link href={backHref}>{backLabel}</Link>} />
      </Card>
    </main>
  );
}
