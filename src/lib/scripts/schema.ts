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
});

export const scriptDocSchema = z
  .object({
    header: scriptHeaderSchema,
    context: contextCardSchema,
    cast: z.array(castMemberSchema).min(1),
    shots: z.array(shotSchema).min(1),
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
    doc.shots.forEach((shot, i) => {
      for (const id of shot.onScreen) {
        if (!known.has(id)) {
          ctx.addIssue({ code: "custom", path: ["shots", i, "onScreen"], message: `Unknown cast member "${id}".` });
        }
      }
    });
  });

export type ScriptHeader = z.infer<typeof scriptHeaderSchema>;
export type ContextCard = z.infer<typeof contextCardSchema>;
export type CastMember = z.infer<typeof castMemberSchema>;
export type Shot = z.infer<typeof shotSchema>;
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
