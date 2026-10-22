import type { ImportOutput } from "@/lib/scripts/copilot/output";

// A faithful reading of REEL_07_PASTE (paste-a-script spec §7, success 1–3). The review VO keeps the
// export's backslash escapes, as a model sometimes does; buildImport must clean them (Review Focus 1).
export const REEL_07_IMPORT: ImportOutput = {
  readable: true,
  problem: "",
  reelNumber: 7,
  header: {
    title: "Greek yogurt before the 9:30 stand-up", format: "UGC · REVIEW · OPTION", region: "Pan-India",
    postDate: "Thu 19 Nov", theme: "Diabetes Awareness Month", aspect: "9:16", targetLength: "45 to 55 sec", production: "AI-generated",
  },
  context: {
    purpose: "A younger viewer's version of the habit: plain Greek yogurt for breakfast on a workday, with the flour stirred in.",
    settingAndCamera: "Compact rented flat kitchen at 8:15 am. Steel bowl, a tub of plain Greek yogurt with no label, chopped apple, a handful of nuts, laptop open at the end of the counter. Natural light. Handheld, top-down on the bowl.",
    disclaimers: [
      "D1, on every reel. Helps control blood sugar levels when used as part of a diabetic diet and lifestyle. Individual results may vary.",
      "D2, on every reel. Not a substitute for prescribed medication. Consult your doctor before changing your diabetes management.",
      "D4, on the pack end card of every reel. This is not a medicine. FSSAI Lic. No. ____ (licence number to be supplied by the brand).",
    ].join("\n"),
    watchOuts: [
      "Plain yogurt only. No flavoured or sweetened yogurt, honey or granola on screen.",
      "No protein, muscle, weight-loss or 'diet food' language. The flour is not described as protein or as a fat-burner.",
      "Rhea is an adult in her late 20s. Say nothing about her own sugar or health.",
      "Unlabelled tub, so no real yogurt brand appears.",
    ],
  },
  cast: [{
    key: "rhea", name: "Rhea", isLead: true,
    description: "Rhea, 27, Bengaluru, a product designer at a start-up. Oversized shirt, hair in a claw clip, earphones round her neck. Quick and dry, English with an easy Bengaluru mix.",
  }],
  shots: [
    { beat: "HOOK", lengthSeconds: 4, visual: "Rhea spoons yogurt into a steel bowl with one hand and checks her phone with the other.", vo: "Okay, breakfast. I've got eight minutes before my stand-up.", onScreenText: "8 minutes", onScreen: ["rhea"] },
    { beat: "INTRO", lengthSeconds: 5, visual: "Plain Greek yogurt in the bowl, a small pile of nuts, an apple on the board.", vo: "Plain Greek yogurt, some nuts, half an apple. That's most of my mornings.", onScreenText: "Plain yogurt. Nuts. Apple.", onScreen: [] },
    { beat: "STORY", lengthSeconds: 6, visual: "Her phone buzzes with a calendar reminder. She shrugs and keeps going.", vo: "I'm not cooking at eight in the morning, so whatever I add has to be quick.", onScreenText: "Seconds, not minutes", onScreen: ["rhea"] },
    { beat: "STEP", lengthSeconds: 6, visual: "Top-down: one level tablespoon of flour is stirred through the yogurt until smooth.", vo: "One level tablespoon of the jackfruit flour, straight into the yogurt. Stir till it's smooth.", onScreenText: "Just 1 tablespoon per meal", onScreen: [] },
    { beat: "REVIEW", lengthSeconds: 8, visual: "A real Amazon review card slides in with a Verified Purchase badge. Rhea glances at it. Use a real, cleared review on this theme: adding it to a quick breakfast.", vo: String.raw`One customer wrote on Amazon: "\[real review, verbatim\]".`, onScreenText: "Customer review on Amazon\nVerified Purchase", onScreen: ["rhea"] },
    { beat: "BODY", lengthSeconds: 6, visual: "Chopped apple and nuts go on top. Rhea eats standing, one eye on the laptop.", vo: "Apple and nuts on top, and I eat it standing up, one eye on my mail.", onScreenText: "Breakfast, done.", onScreen: ["rhea"] },
    { beat: "PAYOFF", lengthSeconds: 5, visual: "She rinses the bowl, puts the pack back beside the yogurt tub and picks up her tote.", vo: "Bowl in the sink, bag on my shoulder, out by nine. Mostly.", onScreenText: "Out by nine.", onScreen: ["rhea"] },
    { beat: "PROOF", lengthSeconds: 5, visual: "Hold on the claim card over the pack.", vo: "It's 100% green jackfruit, nothing else. And it's clinically tested.", onScreenText: "Helps control blood sugar levels*\n100% green jackfruit. Nothing else.", onScreen: [] },
    { beat: "OUTRO", lengthSeconds: 5, visual: "Pack on the counter beside the yogurt tub.", vo: "Jackfruit365 Green Jackfruit Flour. Available on Amazon.", onScreenText: "Pack shot. Available on Amazon. Disclaimer line.", onScreen: [] },
  ],
  kept: [{ name: "D3 disclaimer", text: "D3, whenever the study, the journal or the claim card with the study line appears. Based on a randomised, double-blind, placebo-controlled study, Nutrition & Diabetes, 2021." }],
  guessed: { beats: false, lead: false },
  summary: "Rhea's workday Greek-yogurt breakfast, with the flour stirred in.",
};
