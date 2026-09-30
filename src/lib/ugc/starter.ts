// Starter board so a first session can go straight to Generate face → Run all.
// Taken from the CHUPPS "Boring Sliders — Not Anymore" UGC brief: two creators from the
// brief's 18–25 college/lifestyle audience, each with the same two 5s hook beats, so the
// very first run is already a face-vs-face comparison. Scripts ask for no background music
// so any finished clip is a clean source for "Use this voice".
import { newRow, newTile, type FaceRow } from "./board";

const creator = (who: string) =>
  `Photorealistic vertical selfie-style portrait of ${who}, 18–25, Indian college student, ` +
  `trendy casual streetwear, natural makeup-free look, bright modern apartment with soft ` +
  `daylight, looking straight into a phone camera, upper body, authentic UGC creator vibe`;

const SCRIPTS = [
  `The creator in the reference image holds up a plain, ordinary pair of black sliders to ` +
    `the camera with a bored, unimpressed face, then shrugs. Handheld selfie video, casual ` +
    `UGC style, no background music. They say in Hinglish: ` +
    `"Why do most sliders look exactly the same?"`,
  `The creator in the reference image slips on a pair of stylish, colourful sliders and ` +
    `checks them out in a mirror, grinning. Handheld selfie video, casual UGC style, no ` +
    `background music. They say: "Then I found these CHUPPS. Finally, sliders I actually ` +
    `want to wear outside."`,
];

const CREATORS = [
  { who: "a young Indian woman", voice: "young Indian woman, early 20s, warm and upbeat, casual" },
  { who: "a young Indian man", voice: "young Indian man, early 20s, relaxed and friendly, casual" },
];

export function starterRows(): FaceRow[] {
  return CREATORS.map(({ who, voice }) => ({
    ...newRow(creator(who), voice),
    tiles: SCRIPTS.map((s) => newTile(s)),
  }));
}
