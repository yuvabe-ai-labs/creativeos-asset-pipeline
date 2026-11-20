"use client";

import { useState, type ReactElement } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveProductAction } from "@/lib/actions/billing-catalog";
import type { CatalogProduct } from "@/lib/billing/catalog";
import { BillingChangeDialog } from "@/components/admin/billing/billing-change-dialog";
import { SegmentedChoice } from "@/components/admin/billing/segmented-choice";

const NOUN = { plan: "plan", topup: "top-up pack" } as const;

// Add a plan or pack, or edit its name, description and whether owners can see it (spec §2).
export function ProductDialog({ kind, product, trigger }: { kind: "plan" | "topup"; product?: CatalogProduct; trigger: ReactElement }) {
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [shown, setShown] = useState<"shown" | "hidden">(product && !product.active ? "hidden" : "shown");
  return (
    <BillingChangeDialog
      trigger={trigger}
      title={product ? `Edit ${product.name}` : `Add a ${NOUN[kind]}`}
      description={product ? "Name and description change for everyone at once. Prices stay as they are." : "Add a price to it next."}
      saveLabel={product ? "Save" : `Add ${NOUN[kind]}`}
      onOpen={() => {
        setName(product?.name ?? "");
        setDescription(product?.description ?? "");
        setShown(product && !product.active ? "hidden" : "shown");
      }}
      onSubmit={() =>
        saveProductAction({ id: product?.id ?? null, kind, name, description, active: product ? shown === "shown" : undefined })
      }
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-name">Name</Label>
        <Input id="product-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "plan" ? "e.g. Studio" : "e.g. 25,000 credits"} autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-description">Description</Label>
        <Textarea id="product-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Shown to owners on the plans page" />
      </div>
      {product && (
        <div className="flex flex-col gap-1.5">
          <Label>Owners can see it</Label>
          <SegmentedChoice value={shown} options={[{ value: "shown", label: "Shown" }, { value: "hidden", label: "Hidden" }]} onChange={setShown} />
          <span className="text-xs text-muted-foreground">Hidden: no new purchases. Agencies already on it keep it.</span>
        </div>
      )}
    </BillingChangeDialog>
  );
}
