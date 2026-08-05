import type { BrandAssetCategory } from "./types";

/**
 * The id given to the entry synthesized from `clients.logo_url` (D131). It is not a row,
 * so it can never be deleted through the assets endpoint — the client page owns it.
 */
export const SYNTHETIC_LOGO_ID = "client-logo";

/** Section order in the panel, with the plain-English labels and empty-state copy.
 *  `hint` is shown when a section has nothing in it — instructive, not a shrug. */
export const BRAND_ASSET_CATEGORIES: {
  category: BrandAssetCategory;
  label: string;
  hint: string;
  columns: 2 | 3;
}[] = [
  {
    category: "logo",
    label: "Logos",
    hint: "No logos yet — upload one and it's available on every canvas for this client.",
    columns: 3,
  },
  {
    category: "background",
    label: "Backgrounds",
    hint: "No backgrounds yet — upload one to fill the whole canvas in a click.",
    columns: 2,
  },
  {
    category: "product",
    label: "Products",
    hint: "No product shots yet — upload one to drop it straight into a post.",
    columns: 3,
  },
];

/** The detail fields, in the order they appear. `key` matches BrandDetails exactly. */
export const BRAND_DETAIL_FIELDS: {
  key: keyof import("./types").BrandDetails;
  label: string;
  placeholder: string;
}[] = [
  { key: "phone", label: "Phone", placeholder: "+91 98765 43210" },
  { key: "email", label: "Email", placeholder: "hello@example.com" },
  { key: "website", label: "Website", placeholder: "example.com" },
  { key: "address", label: "Address", placeholder: "12 Main Road, Auroville" },
  { key: "instagram", label: "Instagram", placeholder: "@yourhandle" },
  { key: "facebook", label: "Facebook", placeholder: "/yourpage" },
  { key: "whatsapp", label: "WhatsApp", placeholder: "+91 98765 43210" },
];
