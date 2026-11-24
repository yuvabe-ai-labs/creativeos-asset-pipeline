// One market reference read by the agent (D530): what the post does, in the words a signal is
// drafted from. Kept on the item (`moodboard_items.reading`, 0067) so a post is read once.

export type PostReading = {
  handle: string;
  caption: string;
  /** How the post opens: the first second or line. */
  hook: string;
  format: string;
  pacing: string;
  onScreenText: string;
  setting: string;
  occasion: string;
  summary: string;
  /** Read from the archived media itself, or only from its thumbnail and caption. */
  from: "media" | "thumbnail";
};
