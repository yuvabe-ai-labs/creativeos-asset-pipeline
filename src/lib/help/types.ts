export type HelpStep = {
  title: string; // also the caption of this step's block on the map page
  body: string;
  clip: string; // URL of the looping clip (object storage)
};

export type HelpChapter = {
  slug: string; // URL key, e.g. "create-a-reel"
  question: string; // menu label, e.g. "How do I create a reel?"
  summary: string; // required — the description on the map page every chapter opens with
  steps: HelpStep[];
  /**
   * "sequence" (default) draws connectors between map blocks. "alternatives" drops them —
   * for chapters that are several routes to one outcome, where connectors would tell the
   * viewer to do all of them in order.
   */
  mapStyle?: "sequence" | "alternatives";
  draft?: boolean; // authored but unrecorded — excluded from the menu
};
