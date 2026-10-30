import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeScript, SCRIPT_ID } from "@/lib/scripts/visualise/__tests__/fixtures";
import type { AssetOpBuilder } from "@/lib/db/script-assets";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/script-assets", () => ({ changeScriptAssets: vi.fn(), foreignImageUrls: vi.fn() }));
vi.mock("@/lib/storage", () => ({ signScriptAssetUpload: vi.fn() }));
vi.mock("@/lib/storage/gcs", () => ({ publicUrlFor: (p: string) => `https://storage.example/${p}` }));

import { resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { changeScriptAssets, foreignImageUrls } from "@/lib/db/script-assets";
import { signScriptAssetUpload } from "@/lib/storage";

const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

const base = makeScript().doc;
const doc = {
  ...base,
  products: [{ id: "pouch", name: "Pouch", images: [{ url: "https://kit/pouch.png", source: "brand-kit" as const }] }],
  locations: [{ id: "kitchen", name: "Kitchen", description: "", image: null }],
};
/** The builder the route handed changeScriptAssets, run against `doc`. */
const built = () => (vi.mocked(changeScriptAssets).mock.calls[0][2] as AssetOpBuilder)(doc);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Client", org_id: "org-1" } as never);
  vi.mocked(changeScriptAssets).mockResolvedValue({ ok: true, doc, stage: "generate" });
  vi.mocked(foreignImageUrls).mockResolvedValue([]);
});

describe("POST …/scripts/:scriptId/assets", () => {
  it("applies one op through the stage-aware write and returns the doc", async () => {
    const { POST } = await import("./route");
    const op = { op: "set_shot_assets", shotId: "s01", products: ["pouch"], location: "kitchen" };
    const res = await POST(post("assets", op), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ stage: "generate" });
    expect(built()).toEqual(op);
  });

  it("refuses a picture that is not this client's", async () => {
    vi.mocked(foreignImageUrls).mockResolvedValue(["https://elsewhere/x.png"]);
    const { POST } = await import("./route");
    await POST(post("assets", {
      op: "set_product_images", productId: "pouch",
      images: [{ url: "https://elsewhere/x.png", source: "kb" }],
    }), { params });
    expect(built()).toEqual({ error: "That picture isn't one of this client's.", status: 403 });
  });

  it("keeps a picture the script already holds usable, even if the library dropped it", async () => {
    vi.mocked(foreignImageUrls).mockResolvedValue(["https://kit/pouch.png"]);
    const { POST } = await import("./route");
    const op = { op: "set_product_images", productId: "pouch", images: [{ url: "https://kit/pouch.png", source: "brand-kit" }] };
    await POST(post("assets", op), { params });
    expect(built()).toEqual(op);
  });

  it("is a 400 for a body that is no op, and passes a write's refusal through", async () => {
    const { POST } = await import("./route");
    expect((await POST(post("assets", { op: "paint_it" }), { params })).status).toBe(400);
    vi.mocked(changeScriptAssets).mockResolvedValue({ ok: false, error: "No.", status: 409 });
    expect((await POST(post("assets", { op: "remove_product", productId: "pouch" }), { params })).status).toBe(409);
  });
});

describe("POST …/assets/sign", () => {
  it("signs an image upload into the script's own folder", async () => {
    vi.mocked(signScriptAssetUpload).mockResolvedValue({ signedUrl: "s", path: "p", url: "u" });
    const { POST } = await import("./sign/route");
    const res = await POST(post("assets/sign", { filename: "Pouch.PNG", contentType: "image/png", size: 10, kind: "products" }), { params });
    expect(res.status).toBe(200);
    expect(signScriptAssetUpload).toHaveBeenCalledWith({ clientId: "c1", scriptId: SCRIPT_ID, kind: "products", ext: "png", contentType: "image/png" });
  });

  it("refuses other file types and pictures over the limit", async () => {
    const { POST } = await import("./sign/route");
    expect((await POST(post("assets/sign", { filename: "a.svg", size: 1, kind: "products" }), { params })).status).toBe(400);
    expect((await POST(post("assets/sign", { filename: "a.png", size: 16 * 1024 * 1024, kind: "products" }), { params })).status).toBe(400);
  });
});

describe("POST …/assets/uploaded", () => {
  const own = `clients/c1/scripts/${SCRIPT_ID}/assets/products/product.png`;

  it("adds the upload after a product's other pictures", async () => {
    const { POST } = await import("./uploaded/route");
    const res = await POST(post("assets/uploaded", { path: own, target: { kind: "product", productId: "pouch" } }), { params });
    expect(res.status).toBe(200);
    expect(built()).toEqual({
      op: "set_product_images", productId: "pouch",
      images: [doc.products[0].images[0], { url: `https://storage.example/${own}`, source: "upload" }],
    });
  });

  it("makes it a location's plate", async () => {
    const { POST } = await import("./uploaded/route");
    await POST(post("assets/uploaded", { path: own, target: { kind: "location", locationId: "kitchen" } }), { params });
    expect(built()).toEqual({ op: "set_location_image", locationId: "kitchen", image: { url: `https://storage.example/${own}`, source: "upload" } });
  });

  it("refuses a path outside this script's folder", async () => {
    const { POST } = await import("./uploaded/route");
    const res = await POST(post("assets/uploaded", { path: "clients/c2/scripts/x/assets/p.png", target: { kind: "location", locationId: "kitchen" } }), { params });
    expect(res.status).toBe(403);
    expect(changeScriptAssets).not.toHaveBeenCalled();
  });
});
