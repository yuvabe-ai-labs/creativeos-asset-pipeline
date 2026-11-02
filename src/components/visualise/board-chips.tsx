"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScriptAssets } from "@/components/scripts/script-assets-context";
import { ScriptLocationCard } from "@/components/scripts/script-location-card";
import { ScriptProductCard } from "@/components/scripts/script-product-card";
import type { Avatar } from "@/lib/avatars/schema";
import { MAX_LOCATIONS, MAX_PRODUCTS, type ScriptDoc } from "@/lib/scripts/schema";
import { shotsUsing } from "@/lib/scripts/utils";
import { AssetChip } from "./asset-chip";
import { CastChip } from "./cast-chip";

const ADD = "h-auto rounded-xl border border-dashed border-primary/40 px-3 py-2 text-primary hover:bg-primary/5";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label.split(" ·")[0]} className="flex flex-col gap-2">
      <h2 className="text-eyebrow">{label}</h2>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </section>
  );
}

// D465 — the board's cast, locations and products as chips on the summary card; each opens its
// full editor in a popup. The cast comes from the script, so only locations and products add.
export function BoardChips({ clientId, scriptId, doc, avatars, faces, castMarker }: {
  clientId: string;
  scriptId: string;
  doc: ScriptDoc;
  avatars: ReadonlyMap<string, Avatar>;
  /** Each avatar's face, by avatar id. */
  faces: Record<string, string | null>;
  /** Spec 4 merge point: the comment marker on a person. */
  castMarker?: (castId: string) => ReactNode;
}) {
  const assets = useScriptAssets();
  const working = (id: string, kind: "product" | "location") =>
    assets?.uploadingTo === id ? "Uploading…" : kind === "location" && assets?.drawing.has(id) ? "Drawing…" : null;
  return (
    <div className="flex flex-col gap-4">
      <Row label={`Cast · ${doc.cast.length}`}>
        {doc.cast.map((member) => (
          <CastChip
            key={member.id}
            clientId={clientId}
            scriptId={scriptId}
            member={member}
            avatar={member.avatarId ? avatars.get(member.avatarId) ?? null : null}
            faceUrl={member.avatarId ? faces[member.avatarId] ?? null : null}
            takenIds={doc.cast.filter((c) => c.id !== member.id && c.avatarId).map((c) => c.avatarId!)}
            marker={castMarker?.(member.id)}
          />
        ))}
      </Row>
      <Row label={`Locations · ${doc.locations.length}`}>
        {doc.locations.map((l) => (
          <AssetChip
            key={l.id}
            kind="location"
            name={l.name}
            thumbUrl={l.image?.url ?? null}
            usedIn={shotsUsing(doc, { locationId: l.id })}
            working={working(l.id, "location")}
          >
            <ScriptLocationCard location={l} large />
          </AssetChip>
        ))}
        {assets && doc.locations.length < MAX_LOCATIONS && (
          <Button variant="ghost" size="sm" className={ADD} onClick={() => assets.op({ op: "add_location", name: "New location", description: "" })}>
            <Plus className="size-4" strokeWidth={1.5} />
            Add a location
          </Button>
        )}
      </Row>
      <Row label={`Products · ${doc.products.length}`}>
        {doc.products.map((p) => (
          <AssetChip
            key={p.id}
            kind="product"
            name={p.name}
            thumbUrl={p.images[0]?.url ?? null}
            usedIn={shotsUsing(doc, { productId: p.id })}
            needsPicture={p.images.length === 0}
            working={working(p.id, "product")}
          >
            <ScriptProductCard product={p} />
          </AssetChip>
        ))}
        {assets && doc.products.length < MAX_PRODUCTS && (
          <Button variant="ghost" size="sm" className={ADD} onClick={() => assets.op({ op: "add_product", name: "New product" })}>
            <Plus className="size-4" strokeWidth={1.5} />
            Add a product
          </Button>
        )}
      </Row>
    </div>
  );
}
