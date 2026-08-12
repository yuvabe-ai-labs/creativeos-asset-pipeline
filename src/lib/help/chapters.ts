import type { HelpChapter } from "@/lib/help/types";

// Clips are hosted in object storage rather than committed — ~40 eventual clips would
// otherwise become permanent repo weight (D13 keeps bytes out of the database too).
const CLIPS = "https://storage.googleapis.com/creativeos-help/v1";

export const HELP_CHAPTERS: HelpChapter[] = [
  {
    slug: "create-a-reel",
    question: "How do I create a reel?",
    summary:
      "The full path from a finished script to an approved clip. Every step happens on one canvas — you never leave to another tool.",
    steps: [
      {
        title: "Paste your reel script",
        body: [
          "Open the Script node on the canvas.",
          "Paste your finished script, or drop a .md or .txt file.",
          "CreativeOS parses it into structured, editable fields.",
        ],
        clip: `${CLIPS}/create-a-reel/01-paste-script.mp4`,
      },
      {
        title: "Fan out the shots",
        body: [
          "One reel is many shots.",
          "Fanning out gives each shot in the parsed script its own Shot node.",
          "Each one can then be worked on independently.",
        ],
        clip: `${CLIPS}/create-a-reel/02-fan-out-shots.mp4`,
      },
      {
        title: "Write the image prompt for a shot",
        body: [
          "From a Shot node, create the image prompt.",
          "It carries the shot's visual description and the client's Brand KB.",
          "It does not carry the reel copy.",
        ],
        clip: `${CLIPS}/create-a-reel/03-image-prompt.mp4`,
      },
      {
        title: "Generate and approve the image",
        body: [
          "Set your master controls, then generate.",
          "Every attempt is kept, so nothing is lost.",
          "Compare the attempts and approve the one you want.",
        ],
        clip: `${CLIPS}/create-a-reel/04-generate-image.mp4`,
      },
      {
        title: "Write the motion prompt from the approved still",
        body: [
          "The Motion Prompt node reads your approved still.",
          "It writes a motion prompt with camera and movement controls.",
        ],
        clip: `${CLIPS}/create-a-reel/05-motion-prompt.mp4`,
      },
      {
        title: "Generate the clip",
        body: [
          "Video generation runs in the background.",
          "Keep working anywhere on the canvas.",
          "The generation tray tells you when the clip is ready.",
        ],
        clip: `${CLIPS}/create-a-reel/06-generate-clip.mp4`,
      },
      {
        title: "Approve and archive",
        body: [
          "Approve the clip you want to keep.",
          "Archive the project to bundle the script, prompts, controls and attempts together.",
        ],
        clip: `${CLIPS}/create-a-reel/07-approve-archive.mp4`,
      },
    ],
  },
  {
    slug: "review-the-brand-kb",
    question: "How do I review the Brand KB?",
    summary:
      "The Brand KB is built once per client and feeds every generation after that. Reviewing it is a one-time pass — and there is a fast way through it.",
    steps: [
      {
        title: "What the KB is, and where these values came from",
        body: [
          "Around 40 fields across seven modules, extracted from the brand site and the documents you uploaded.",
          "Each field shows its confidence, and whether it was stated or inferred.",
        ],
        clip: `${CLIPS}/review-the-brand-kb/01-what-it-is.mp4`,
      },
      {
        title: "Work module by module",
        body: [
          "Take one module at a time.",
          "Where the extraction did well, Approve all clears the whole module in a click.",
          "You do not have to touch every field individually.",
        ],
        clip: `${CLIPS}/review-the-brand-kb/02-module-by-module.mp4`,
      },
      {
        title: "Fix a field — edit, reject, or re-ask",
        body: [
          "Edit the value directly.",
          "Reject it as not applicable.",
          "Or re-ask with a comment like 'this brand is vegan, not luxury' to re-extract just that field.",
        ],
        clip: `${CLIPS}/review-the-brand-kb/03-fix-a-field.mp4`,
      },
      {
        title: "Mark the KB ready",
        body: [
          "Once every field is reviewed, Mark KB Ready unlocks.",
          "That is what makes canvases available for this client.",
        ],
        clip: `${CLIPS}/review-the-brand-kb/04-mark-ready.mp4`,
      },
    ],
  },
  {
    slug: "edit-an-image",
    question: "How do I edit an image?",
    summary:
      "A targeted change to an image you already generated. An edit is a new attempt on the same node — your earlier versions are never overwritten.",
    steps: [
      {
        title: "Choose what to change — remove, replace, or add",
        body: [
          "On the Image Gen node, pick the quick action that matches your intent — remove, replace or add.",
          "The rest of the image is preserved.",
        ],
        clip: `${CLIPS}/edit-an-image/01-choose-change.mp4`,
      },
      {
        title: "Run the edit and compare it against earlier attempts",
        body: [
          "The edit runs the model, so it lands as a new attempt in the version log.",
          "Step back through attempts to compare before approving.",
        ],
        clip: `${CLIPS}/edit-an-image/02-compare-attempts.mp4`,
      },
    ],
  },
  {
    slug: "generate-a-reference-image",
    question: "How do I generate a reference image?",
    summary:
      "Sometimes you need an image to steer another generation rather than to ship. Generate it, then wire it in as a reference.",
    steps: [
      {
        title: "Generate the look you want to reference",
        body: [
          "Use an Image Gen node for the look you want to carry over.",
          "Prompt for palette, surface and mood rather than for the finished asset.",
        ],
        clip: `${CLIPS}/generate-a-reference-image/01-generate-the-look.mp4`,
      },
      {
        title: "Bring it in from Generated Images",
        body: [
          "Right-click the node that needs the reference.",
          "Choose Add Reference Image.",
          "Pick your image from the Generated Images tab.",
        ],
        clip: `${CLIPS}/generate-a-reference-image/02-add-reference.mp4`,
      },
      {
        title: "Connect it, then generate",
        body: [
          "The picker drops a File node beside your target but does not wire it up.",
          "Draw the connection yourself.",
          "An unconnected reference is simply ignored.",
        ],
        clip: `${CLIPS}/generate-a-reference-image/03-connect-and-generate.mp4`,
      },
    ],
  },
  {
    slug: "bring-in-references",
    question: "How do I bring in references?",
    summary:
      "Three ways to get an existing image onto the canvas. Pick whichever suits where the image lives — they all end the same way.",
    stepStyle: "alternatives",
    steps: [
      {
        title: "Upload or paste",
        body: [
          "Drop an image file straight onto the canvas.",
          "Or paste one from your clipboard.",
          "Either creates a File node where you drop it.",
        ],
        clip: `${CLIPS}/bring-in-references/01-upload-or-paste.mp4`,
      },
      {
        title: "Pull from Google Drive or this canvas's generated images",
        body: [
          "Right-click a node and choose Add Reference Image.",
          "Browse connected Drive folders, or everything already generated on this canvas.",
        ],
        clip: `${CLIPS}/bring-in-references/02-drive-or-generated.mp4`,
      },
      {
        title: "Reuse a client moodboard",
        body: [
          "Open the Gallery drawer and switch to Moodboards.",
          "Drag an item onto the canvas.",
          "It becomes an ordinary File node.",
        ],
        clip: `${CLIPS}/bring-in-references/03-moodboard.mp4`,
      },
    ],
  },
  {
    slug: "why-cant-i-edit-this-canvas",
    question: "Why can't I edit this canvas?",
    summary:
      "A canvas is edited by one person at a time. If it opened read-only, someone else is holding it — here is how to tell, and how to take over.",
    steps: [
      {
        title: "Someone else holds the editing lock",
        body: [
          "The banner names who is currently editing.",
          "You can still open every node and read everything.",
          "Only changes are blocked, so you cannot overwrite their work.",
        ],
        clip: `${CLIPS}/why-cant-i-edit-this-canvas/01-someone-editing.mp4`,
      },
      {
        title: "Take over once their session goes stale",
        body: [
          "If they have stopped working, their session goes stale.",
          "The take-over button then becomes available and the canvas is yours to edit.",
        ],
        clip: `${CLIPS}/why-cant-i-edit-this-canvas/02-take-over.mp4`,
      },
    ],
  },
  {
    slug: "where-did-my-video-go",
    question: "Where did my video go?",
    summary:
      "Video generation takes minutes, not seconds. It keeps running whether or not you watch it — including if you close the tab.",
    steps: [
      {
        title: "Video generation runs in the background",
        body: [
          "Once you hit generate, the job is queued.",
          "You can keep working anywhere on the canvas.",
          "Nothing is lost if you navigate away or close the tab.",
        ],
        clip: `${CLIPS}/where-did-my-video-go/01-runs-in-background.mp4`,
      },
      {
        title: "Find it in the generation tray",
        body: [
          "The tray lists every job as Running, Ready or Failed.",
          "Click one to fly to its node and open it.",
          "A ready job stays listed until you approve it.",
        ],
        clip: `${CLIPS}/where-did-my-video-go/02-generation-tray.mp4`,
      },
    ],
  },

  // ── Authored, not yet recorded. Kept here so recording one later is "add clip URLs
  // and body lines, then drop the draft flag" — no code change, no design decision left
  // to re-make.
  {
    slug: "edit-an-image-in-isolation",
    question: "How do I edit an image in isolation?",
    summary:
      "Editing an image that is not part of a reel — bring it in yourself, then edit it like any generated image.",
    draft: true,
    steps: [
      { title: "Bring the image in as a File node", body: [], clip: "" },
      { title: "Connect it to an Image Gen node", body: [], clip: "" },
      { title: "Edit it with remove, replace or add", body: [], clip: "" },
    ],
  },
  {
    slug: "create-an-image-prompt",
    question: "How do I create an image prompt?",
    summary: "Turning a shot into a prompt that carries brand context.",
    draft: true,
    steps: [
      { title: "Start from a Shot node", body: [], clip: "" },
      { title: "Check what context is attached", body: [], clip: "" },
      { title: "Generate and edit the prompt", body: [], clip: "" },
    ],
  },
  {
    slug: "create-an-image",
    question: "How do I create an image?",
    summary: "Going from a prompt to an approved still.",
    draft: true,
    steps: [
      { title: "Connect a prompt to an Image Gen node", body: [], clip: "" },
      { title: "Set the master controls", body: [], clip: "" },
      { title: "Generate and approve an attempt", body: [], clip: "" },
    ],
  },
  {
    slug: "turn-a-still-into-a-video",
    question: "How do I turn a still into a video?",
    summary: "Using an approved image as the start frame for a clip.",
    draft: true,
    steps: [
      { title: "Create a Motion Prompt from the still", body: [], clip: "" },
      { title: "Set camera and motion controls", body: [], clip: "" },
      { title: "Generate the clip", body: [], clip: "" },
    ],
  },
  {
    slug: "go-back-to-an-earlier-version",
    question: "How do I go back to an earlier version?",
    summary: "Every model run is kept — how to find and restore an earlier one.",
    draft: true,
    steps: [
      { title: "Open the version history", body: [], clip: "" },
      { title: "Compare and restore a version", body: [], clip: "" },
    ],
  },
  {
    slug: "set-up-a-new-client",
    question: "How do I set up a new client?",
    summary: "Creating a client and building its Brand KB.",
    draft: true,
    steps: [
      { title: "Create the client", body: [], clip: "" },
      { title: "Add the brand site and documents", body: [], clip: "" },
      { title: "Build the KB", body: [], clip: "" },
    ],
  },
  {
    slug: "archive-a-project",
    question: "How do I archive a project?",
    summary: "Bundling a finished reel with everything that produced it.",
    draft: true,
    steps: [
      { title: "Approve the clips you want", body: [], clip: "" },
      { title: "Archive the project", body: [], clip: "" },
    ],
  },
  {
    slug: "fundamentals-of-prompting-for-images",
    question: "What are the fundamentals of prompting for images?",
    summary: "The principles behind a prompt that produces a usable still.",
    stepStyle: "alternatives",
    draft: true,
    steps: [
      { title: "Describe the subject concretely", body: [], clip: "" },
      { title: "Separate subject from style", body: [], clip: "" },
      { title: "Let the Brand KB carry brand voice", body: [], clip: "" },
    ],
  },
  {
    slug: "fundamentals-of-prompting-for-reels",
    question: "What are the fundamentals of prompting for reels?",
    summary: "How motion prompts differ from image prompts.",
    stepStyle: "alternatives",
    draft: true,
    steps: [
      { title: "Describe motion, not appearance", body: [], clip: "" },
      { title: "Keep camera language explicit", body: [], clip: "" },
      { title: "Preserve the approved still", body: [], clip: "" },
    ],
  },
];

/** Chapters shown in the menu — recorded ones only. */
export function visibleChapters(): HelpChapter[] {
  return HELP_CHAPTERS.filter((c) => !c.draft);
}

export function chapterBySlug(slug: string): HelpChapter | undefined {
  return HELP_CHAPTERS.find((c) => c.slug === slug);
}
