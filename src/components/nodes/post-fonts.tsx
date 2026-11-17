// NOT unit-tested — next/font/google calls only work through Next's build pipeline
// (see Task 9's note in the plan). Verified by `next build` + manual render check.
import {
  Playfair_Display, Poppins, Merriweather, Bebas_Neue, Libre_Baskerville,
  Noto_Sans_Tamil, Noto_Serif_Tamil,
} from "next/font/google";
import localFont from "next/font/local";
import type { FontKey } from "@/lib/post/fonts";

const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["400", "600", "700"] });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
// Inter is vendored: Google now serves it from /l/font?kit=…&skey=… URLs, which Turbopack's
// next/font/google can't resolve ("queries have exactly one entry"), so the build fails.
const inter = localFont({
  src: [
    { path: "../../fonts/post/Inter-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/post/Inter-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../../fonts/post/Inter-latin-600.woff2", weight: "600", style: "normal" },
    { path: "../../fonts/post/Inter-latin-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});
const merriweather = Merriweather({ subsets: ["latin"], weight: ["400", "700"] });
const bebasNeue = Bebas_Neue({ subsets: ["latin"], weight: ["400"] });
const libreBaskerville = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"] });
const notoSansTamil = Noto_Sans_Tamil({ subsets: ["tamil"], weight: ["400", "600", "700"] });
const notoSerifTamil = Noto_Serif_Tamil({ subsets: ["tamil"], weight: ["400", "600", "700"] });

// FontKey -> the actual CSS font-family string next/font generated for it. Never store
// this string on a layer (it's a build artifact, not stable data) — layers store the
// stable FontKey; this lookup resolves it to CSS only at render/export time.
export const FONT_CSS_FAMILY: Record<FontKey, string> = {
  "playfair-display": playfairDisplay.style.fontFamily,
  "poppins": poppins.style.fontFamily,
  "inter": inter.style.fontFamily,
  "merriweather": merriweather.style.fontFamily,
  "bebas-neue": bebasNeue.style.fontFamily,
  "libre-baskerville": libreBaskerville.style.fontFamily,
  "noto-sans-tamil": notoSansTamil.style.fontFamily,
  "noto-serif-tamil": notoSerifTamil.style.fontFamily,
};
