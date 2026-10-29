// A stored transcript (D411): every word of one file with its time in that file's seconds.
// p = the engine's confidence for the word, 0–1.
export type TranscriptWord = { t: string; s: number; e: number; p: number };

export type Transcript = {
  url: string;
  language: string;
  words: TranscriptWord[];
  engine: string;
  model: string;
  durationSeconds: number;
};

export type TranscribeFailureReason = "no-speech" | "no-sound" | "failed";
