import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ loadClientPage: vi.fn(), getActiveKBVersion: vi.fn() }));
vi.mock("@/lib/permissions/page", () => ({ loadClientPage: m.loadClientPage }));
vi.mock("@/lib/db/kb", () => ({
  listKBDocuments: vi.fn(async () => []),
  listBrandImages: vi.fn(async () => []),
  getActiveKBVersion: m.getActiveKBVersion,
}));
vi.mock("@/lib/db/kb-jobs", () => ({ getLatestKBJob: vi.fn(async () => null) }));
vi.mock("@/lib/db/brand-kit", () => ({ getBrandDetails: vi.fn(async () => ({})) }));
vi.mock("@/components/clients/client-identity", () => ({ ClientIdentity: () => null }));
vi.mock("@/components/kb/kb-onboarding-upload-step", () => ({ KBOnboardingUploadStep: () => null }));
vi.mock("@/components/kb/kb-onboarding-review-step", () => ({ KBOnboardingReviewStep: () => null }));
// The shared button keeps its own useCan("invite") gate; here we only check the page places it.
vi.mock("@/components/clients/client-members-button", () => ({
  ClientMembersButton: ({ slug, clientId }: { slug: string; clientId: string }) => <span data-members={`${slug}:${clientId}`} />,
}));

import KBPage from "./page";

const client = (kb_status: string) => ({ id: "c1", slug: "chupps", name: "Chupps", kb_status, logo_url: null, website_url: null });
const render = async () => renderToStaticMarkup(await KBPage({ params: Promise.resolve({ id: "chupps" }) }));

describe("/clients/[id]/kb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getActiveKBVersion.mockResolvedValue({ id: "v1", output: {}, doc_ids_used: [] });
  });

  // The client page sends everyone here until the brand KB is ready, so Members must be here too.
  it("offers Members while the brand KB is being set up or reviewed", async () => {
    for (const status of ["empty", "in_review"]) {
      m.loadClientPage.mockResolvedValue({ client: client(status) });
      expect(await render()).toContain('data-members="chupps:c1"');
    }
  });

  it("leaves Members to the client page once the brand KB is ready", async () => {
    m.loadClientPage.mockResolvedValue({ client: client("ready") });
    expect(await render()).not.toContain("data-members");
  });
});
