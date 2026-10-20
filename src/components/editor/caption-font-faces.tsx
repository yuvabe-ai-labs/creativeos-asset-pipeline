// NOT unit-tested — next/font/local calls only work through Next's build pipeline. Verified by
// `next build` and the editor's stage. These are the same TTF files the Premiere package ships
// (D392), so the stage renders exactly what Premiere will. Caption content only, never UI chrome.
import localFont from "next/font/local";
import type { CaptionFontKey } from "@/lib/editor/caption-fonts";

const montserrat = localFont({ src: "../../fonts/captions/Montserrat-ExtraBold.ttf", display: "swap" });
const poppins = localFont({ src: "../../fonts/captions/Poppins-Bold.ttf", display: "swap" });
const bebasNeue = localFont({ src: "../../fonts/captions/BebasNeue-Regular.ttf", display: "swap" });
const anton = localFont({ src: "../../fonts/captions/Anton-Regular.ttf", display: "swap" });
const playfairDisplay = localFont({ src: "../../fonts/captions/PlayfairDisplay-Bold.ttf", display: "swap" });

// CaptionFontKey -> the CSS font-family next/font generated. A build artifact: captions store
// the stable key, and this resolves it only at render time.
export const CAPTION_FONT_CSS: Record<CaptionFontKey, string> = {
  montserrat: montserrat.style.fontFamily,
  poppins: poppins.style.fontFamily,
  "bebas-neue": bebasNeue.style.fontFamily,
  anton: anton.style.fontFamily,
  "playfair-display": playfairDisplay.style.fontFamily,
};
