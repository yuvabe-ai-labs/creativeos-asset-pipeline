// D379 — what a preset voice's preview says, in the language being dubbed into. The vendor's
// text-to-speech covers every dub language except Assamese, which previews in English. Lines are
// gender-neutral (the same line is read by female and male voices); have a native speaker check them.
import type { DubLanguage, DubVoice } from "./types";

const LINES: Record<string, string> = {
  "en-IN": "Hello, this is my voice. This is how your video will sound.",
  "hi-IN": "नमस्ते, यह मेरी आवाज़ है। आपका वीडियो इस भाषा में ऐसा सुनाई देगा।",
  "bn-IN": "নমস্কার, এটা আমার কণ্ঠস্বর। আপনার ভিডিও এই ভাষায় এমন শোনাবে।",
  "gu-IN": "નમસ્તે, આ મારો અવાજ છે. તમારો વીડિયો આ ભાષામાં આવો સંભળાશે.",
  "kn-IN": "ನಮಸ್ಕಾರ, ಇದು ನನ್ನ ಧ್ವನಿ. ನಾನು ನಿಮ್ಮ ವೀಡಿಯೊವನ್ನು ಈ ಭಾಷೆಯಲ್ಲಿ ಓದಬಲ್ಲೆ.",
  "ml-IN": "നമസ്കാരം, ഇത് എന്റെ ശബ്ദമാണ്. നിങ്ങളുടെ വീഡിയോ ഈ ഭാഷയിൽ എനിക്ക് വായിക്കാൻ കഴിയും.",
  "mr-IN": "नमस्कार, हा माझा आवाज आहे. तुमचा व्हिडिओ या भाषेत असा ऐकू येईल.",
  "or-IN": "ନମସ୍କାର, ଏହା ମୋର ସ୍ୱର। ମୁଁ ଆପଣଙ୍କ ଭିଡିଓ ଏହି ଭାଷାରେ ପଢ଼ିପାରିବି।",
  "pa-IN": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਇਹ ਮੇਰੀ ਆਵਾਜ਼ ਹੈ। ਤੁਹਾਡੀ ਵੀਡੀਓ ਇਸ ਭਾਸ਼ਾ ਵਿੱਚ ਇਸ ਤਰ੍ਹਾਂ ਸੁਣਾਈ ਦੇਵੇਗੀ।",
  "ta-IN": "வணக்கம், இது என் குரல். உங்கள் வீடியோவை இந்த மொழியில் என்னால் படிக்க முடியும்.",
  "te-IN": "నమస్కారం, ఇది నా గొంతు. మీ వీడియోను ఈ భాషలో నేను చదవగలను.",
};

/** The language a preview is read in: the dub's own, else English (Assamese). */
export function previewLanguage(language: DubLanguage): string {
  return language in LINES ? language : "en-IN";
}

export function previewText(language: DubLanguage): string {
  return LINES[previewLanguage(language)];
}

/** Where a preview is kept: one per voice and preview language, shared by every client. Bump
 *  the version folder when the lines change, so old samples are not served. */
export function pathForDubVoicePreview(voice: DubVoice, language: DubLanguage): string {
  return `dubbing/voice-previews/v1/${voice}-${previewLanguage(language)}.wav`;
}
