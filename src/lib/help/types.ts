export type HelpStep = {
  title: string; // the accordion row label in the chapter rail
  /**
   * Bulleted lines narrating what the clip shows. These describe the step's overall
   * story, not the clip's exact beats — they are not timestamps. A conceptual step
   * (nothing to *do*, only something to understand) is a single line.
   */
  body: string[];
  clip: string; // URL of the looping clip (object storage)
};

export type HelpChapter = {
  slug: string; // URL key, e.g. "create-a-reel"
  question: string; // menu label, e.g. "How do I create a reel?"
  summary: string; // required — sits above the rail, framing the question
  steps: HelpStep[];
  /**
   * "sequence" (default) numbers the rail rows 01, 02, 03… "alternatives" drops the
   * numbers for chapters that are several routes to one outcome, where numbering would
   * tell the viewer to do all of them in order.
   */
  stepStyle?: "sequence" | "alternatives";
  draft?: boolean; // authored but unrecorded — excluded from the menu
};
