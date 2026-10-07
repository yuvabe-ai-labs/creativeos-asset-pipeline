// One image, read once and kept (D312). Shared by the reader (Gemini's response schema), the store
// and the combining step.
import { z } from "zod";
import { IMAGE_FORMATS, IMAGE_PURPOSES } from "./constants";

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
  background: z.string().nullable().describe("What is behind the subject"),
  composition: z.object({
    shot_type: z.string().describe("close-up, medium, wide, flat lay, overhead…"),
    angle: z.string().describe("eye level, top-down, low, high…"),
    framing: z.string().describe("centred, rule of thirds, symmetrical, off-centre…"),
  }),
  lighting: z.string().describe("Light quality and direction"),
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
    font_style: z.string().nullable().describe("bold sans, serif, script, handwritten…"),
    colours_hex: z.array(z.string()).describe("Text colours as #RRGGBB"),
    placement: z.string().nullable().describe("top, centre, lower left…"),
    treatment: z.string().nullable().describe("plain, boxed, outlined, shadowed, on a band…"),
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
