// One image, read once and kept (D312). Shared by the reader (Gemini's response schema), the store
// and the combining step.
import { z } from "zod";
import { CARD_VOCAB, IMAGE_FORMATS, IMAGE_PURPOSES } from "./constants";

const HEX = /^#?[0-9a-fA-F]{6}$/;

export const ImageCardSchema = z.object({
  format: z.enum(IMAGE_FORMATS).describe("What the image looks like"),
  purpose: z.enum(IMAGE_PURPOSES).describe("Why the brand posted it"),
  summary: z.string().describe("One sentence: what the image is"),
  subjects: z.array(z.string()).describe("The main things shown"),
  product: z.object({
    visible: z.boolean().describe("Whether the brand's product is visible"),
    presentation: z.string().nullable().describe("How it is shown: packshot, in hand, in use, flat lay; null if not visible"),
  }),
  setting: z.string().nullable().describe("Where it is: studio, kitchen, outdoors, plain background…"),
  background: z.enum(CARD_VOCAB.background).describe("What kind of background is behind the subject"),
  background_note: z.string().nullable().describe("What the background actually is, in a few words"),
  composition: z.object({
    shot_type: z.enum(CARD_VOCAB.shot_type),
    angle: z.enum(CARD_VOCAB.angle),
    framing: z.enum(CARD_VOCAB.framing),
    note: z.string().describe("What the lists can't say, e.g. 'pack tilted, slightly cropped at the top'"),
  }),
  lighting: z.enum(CARD_VOCAB.lighting).describe("The kind of light"),
  lighting_note: z.string().describe("Light quality and direction, in a few words"),
  colours: z
    .array(
      z.object({
        name: z.string().describe("Plain colour name"),
        hex: z.string().describe("#RRGGBB"),
        share: z.number().describe("Rough share of the image, 0 to 100"),
      }),
    )
    .describe("Up to 6 main colours, largest first"),
  mood: z.array(z.string()).describe("A few mood words"),
  style_tags: z.array(z.string()).describe("A few style words: minimal, editorial, rustic, vibrant…"),
  people: z.object({
    count: z.number().describe("How many people are visible; 0 if none"),
    description: z.string().nullable().describe("Age range, styling, expression; null if none"),
  }),
  text_overlay: z.object({
    present: z.boolean().describe("Whether text is placed on the image"),
    text: z.string().nullable().describe("The text, as written"),
    font_style: z.enum(CARD_VOCAB.font_style).nullable().describe("The main font's family; null if no text"),
    font_note: z.string().nullable().describe("Weight, width and case, e.g. 'bold condensed caps'; null if no text"),
    colours_hex: z.array(z.string()).describe("Text colours as #RRGGBB"),
    placement: z.enum(CARD_VOCAB.placement).nullable().describe("Where the main text sits; null if no text"),
    treatment: z.enum(CARD_VOCAB.treatment).nullable().describe("How the text is set off; null if no text"),
    note: z.string().nullable().describe("Exact position and treatment, e.g. 'lower left, on a yellow rounded band'; null if no text"),
  }),
  logo_visible: z.boolean().describe("Whether the brand's logo appears"),
  polish: z.enum(["professional", "casual", "customer_made"]).describe("How produced it looks"),
});

export type ImageCard = z.infer<typeof ImageCardSchema>;

/** A card's hexes made comparable: "#RRGGBB" upper-case, or null when it isn't a 6-digit hex. */
export function normaliseHex(value: string): string | null {
  const v = value.trim();
  if (!HEX.test(v)) return null;
  return `#${v.replace(/^#/, "").toUpperCase()}`;
}
