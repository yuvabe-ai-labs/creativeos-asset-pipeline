import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { OfferView } from "@/lib/admin/plans-page";
import { PlanCardFace } from "@/components/billing/plan-card-face";

/** An offer as an owner with no plan sees it on their plans and billing pages (D582): the same face
 *  and step, shown here as a preview, so the step does nothing. */
export function AgencyOfferCard({ view }: { view: OfferView }) {
  const { product, price } = view;
  return (
    <Card className="flex flex-col gap-0 py-0 shadow-card">
      <PlanCardFace name={product.name} amountMinor={price?.amount_minor ?? null} credits={price?.credits ?? null} monthly={view.plan} description={product.description} />
      <div className="border-t border-border px-5 py-3">
        <Button className="w-full" variant={view.plan ? "default" : "outline"} disabled>
          {view.plan ? `Pick ${product.name}` : "Buy"}
        </Button>
      </div>
    </Card>
  );
}
