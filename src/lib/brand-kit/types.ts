/** The three kinds of asset a client kit holds. Values are code tokens — the UI never
 *  shows them raw (see BRAND_ASSET_CATEGORIES for the labels). */
export type BrandAssetCategory = "logo" | "background" | "product";

export type BrandAsset = {
  id: string;
  category: BrandAssetCategory;
  name: string;
  storageUrl: string;
};

/**
 * Contact and social details for a client, stored as JSONB on `clients` (D130).
 * Every field is optional and every reader must tolerate its absence (D10) — a client
 * that has filled in nothing at all is the normal starting state, not an error.
 */
export type BrandDetails = {
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  instagram?: string;
  facebook?: string;
  whatsapp?: string;
};

/** Everything the Brand panel needs, in one response — it renders nothing useful
 *  without all three, so three round trips would mean three loading states. */
export type BrandKitPayload = {
  assets: BrandAsset[];
  details: BrandDetails;
  colours: string[];
};
