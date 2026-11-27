import type { CheckoutStatus } from "@/hooks/use-billing-checkout";

const TONE = { info: "text-muted-foreground", ok: "text-foreground", error: "text-destructive" } as const;

// What happened with a payment, under the buttons that started it.
export function CheckoutStatusLine({ status }: { status: CheckoutStatus }) {
  if (!status) return null;
  return (
    <p className={`text-sm ${TONE[status.tone]}`} role="status">
      {status.text}
    </p>
  );
}
