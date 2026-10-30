import { z } from "zod";
import type { ScriptStage } from "./constants";

// Spec 1 §2 — a script is a header, a context card, a cast and an ordered list of shots.
// Stored whole as one JSON document (client_scripts.doc) and validated here on every read.

export const scriptHeaderSchema = z.object({
  reelNumber: z.number().int().positive().nullable(),
  title: z.string().trim().min(1).max(120),
  /** The client's own word for the format, inferred from their scripts (spec 1 §2.1). */
  format: z.string().trim().max(60),
  region: z.string().trim().max(60),
  /** As written: "Sun 11 Oct (first day of Navratri)". */
  postDate: z.string().trim().max(80),
  theme: z.string().trim().max(120),
  aspect: z.string().trim().max(20),
  targetLength: z.string().trim().max(40),
  /** How the reel is made, as the outlines' header line ends: "AI-generated" in all 28. */
  production: z.string().trim().max(40),
});

export const contextCardSchema = z.object({
  purpose: z.string().trim().max(2000),
  settingAndCamera: z.string().trim().max(2000),
  disclaimers: z.string().trim().max(2000),
  watchOuts: z.array(z.string().trim().min(1).max(1000)),
});

export const castMemberSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  /** The person in words: age, place, clothing, identity markers, voice. */
  description: z.string().trim().max(2000),
  /** The client Avatar this person is, once one exists (spec 3 makes or picks it). */
  avatarId: z.uuid().nullable(),
  isLead: z.boolean(),
});

/** D446 — the caps on a script's own products and locations. */
export const MAX_PRODUCTS = 8;
export const MAX_PRODUCT_IMAGES = 6;
export const MAX_LOCATIONS = 6;

/** A picture a script holds for a product or a location. */
export const scriptImageSchema = z.object({
  url: z.url(),
  /** Where it came from, for the picker's provenance line; never read for behaviour. */
  source: z.enum(["upload", "brand-kit", "kb", "generated", "plate"]),
});

/** D446 — a product this script shows. Its images: the main packshot first, then angles. */
export const productSchema = z.object({
  id: z.string().min(1).max(64),
  /** What the operator calls it: "Jackfruit365 pouch". Also the label the video model reads. */
  name: z.string().trim().min(1).max(80),
  /** Empty until the operator adds one; the copilot never sets images. */
  images: z.array(scriptImageSchema).max(MAX_PRODUCT_IMAGES),
});

/** D446 — a place this script's shots happen in. */
export const locationSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  /** The place in words: what the plate is drawn from. */
  description: z.string().trim().max(2000),
  /** The background plate: an empty set, no people. Null until generated or added. */
  image: scriptImageSchema.nullable(),
});

export const shotSchema = z.object({
  id: z.string().min(1).max(64),
  /** Free text: HOOK, STEP, PROOF, or a label the script invents ("WHAT IT IS"). */
  beat: z.string().trim().max(40),
  lengthSeconds: z.number().positive().max(60),
  /** What happens, including setting changes and transitions, written as prose. */
  visual: z.string().trim().max(2000),
  vo: z.string().trim().max(1000),
  onScreenText: z.string().trim().max(500),
  /** Cast member ids on screen; empty means nobody (B-roll). */
  onScreen: z.array(z.string().min(1)),
  /** D446 — product ids this shot shows; empty means none. Defaulted so stored docs still parse. */
  products: z.array(z.string().min(1)).default([]),
  /** D446 — the location id this shot is set in, or null. */
  location: z.string().min(1).nullable().default(null),
});

export const scriptDocSchema = z
  .object({
    header: scriptHeaderSchema,
    context: contextCardSchema,
    cast: z.array(castMemberSchema).min(1),
    shots: z.array(shotSchema).min(1),
    // D446 — defaulted: zod strips unknown keys and rowToScript drops a doc that fails to parse,
    // so every script stored before these existed must still read as "none yet".
    products: z.array(productSchema).max(MAX_PRODUCTS).default([]),
    locations: z.array(locationSchema).max(MAX_LOCATIONS).default([]),
  })
  .superRefine((doc, ctx) => {
    const leads = doc.cast.filter((c) => c.isLead).length;
    if (leads !== 1) {
      ctx.addIssue({ code: "custom", path: ["cast"], message: "A script needs exactly one lead." });
    }
    const castIds = doc.cast.map((c) => c.id);
    if (new Set(castIds).size !== castIds.length) {
      ctx.addIssue({ code: "custom", path: ["cast"], message: "Cast member ids must be unique." });
    }
    const shotIds = doc.shots.map((s) => s.id);
    if (new Set(shotIds).size !== shotIds.length) {
      ctx.addIssue({ code: "custom", path: ["shots"], message: "Shot ids must be unique." });
    }
    const known = new Set(castIds);
    const productIds = doc.products.map((p) => p.id);
    if (new Set(productIds).size !== productIds.length) {
      ctx.addIssue({ code: "custom", path: ["products"], message: "Product ids must be unique." });
    }
    const locationIds = doc.locations.map((l) => l.id);
    if (new Set(locationIds).size !== locationIds.length) {
      ctx.addIssue({ code: "custom", path: ["locations"], message: "Location ids must be unique." });
    }
    const products = new Set(productIds);
    const locations = new Set(locationIds);
    doc.shots.forEach((shot, i) => {
      for (const id of shot.onScreen) {
        if (!known.has(id)) {
          ctx.addIssue({ code: "custom", path: ["shots", i, "onScreen"], message: `Unknown cast member "${id}".` });
        }
      }
      for (const id of shot.products) {
        if (!products.has(id)) {
          ctx.addIssue({ code: "custom", path: ["shots", i, "products"], message: `Unknown product "${id}".` });
        }
      }
      if (shot.location !== null && !locations.has(shot.location)) {
        ctx.addIssue({ code: "custom", path: ["shots", i, "location"], message: `Unknown location "${shot.location}".` });
      }
    });
  });

export type ScriptHeader = z.infer<typeof scriptHeaderSchema>;
export type ContextCard = z.infer<typeof contextCardSchema>;
export type CastMember = z.infer<typeof castMemberSchema>;
export type Shot = z.infer<typeof shotSchema>;
export type ScriptImage = z.infer<typeof scriptImageSchema>;
export type Product = z.infer<typeof productSchema>;
export type ScriptLocation = z.infer<typeof locationSchema>;
export type ScriptDoc = z.infer<typeof scriptDocSchema>;

export type Script = {
  id: string;
  clientId: string;
  stage: ScriptStage;
  doc: ScriptDoc;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
