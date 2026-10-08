// D283/D284 — one voice preview plays at a time, across every picker/card on the page.
// Framework-free so it can be unit-tested; src/hooks/use-voice-preview.ts wraps one shared
// instance for React. Each caller passes an `owner` token: `stop(owner)` only stops audio that
// owner started, so one component unmounting (or stopping its own preview) never cuts off a
// preview another component is playing.

export type AudioLike = {
  play(): Promise<void>;
  pause(): void;
  onEnded(fn: () => void): void;
};

type Listener = (playingId: string | null) => void;

export type PreviewController = {
  toggle(owner: symbol, voice: { voiceId: string; previewUrl: string | null }): void;
  stop(owner: symbol): void;
  subscribe(listener: Listener): () => void;
  playingId(): string | null;
};

export function createPreviewController(makeAudio: (url: string) => AudioLike): PreviewController {
  let audio: AudioLike | null = null;
  let playing: string | null = null;
  let owner: symbol | null = null;
  const listeners = new Set<Listener>();
  const notify = () => listeners.forEach((l) => l(playing));

  const clear = () => {
    audio?.pause();
    audio = null;
    playing = null;
    owner = null;
    notify();
  };

  return {
    toggle(by, voice) {
      if (playing === voice.voiceId) return clear();
      clear();
      if (!voice.previewUrl) return;
      const mine = makeAudio(voice.previewUrl);
      // Only this audio may clear the state — a stale onended/rejection from a superseded
      // preview must not stop the newer one.
      const clearIfCurrent = () => {
        if (audio === mine) clear();
      };
      mine.onEnded(clearIfCurrent);
      audio = mine;
      playing = voice.voiceId;
      owner = by;
      notify();
      void mine.play().catch(clearIfCurrent);
    },
    stop(by) {
      if (owner === by) clear();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    playingId: () => playing,
  };
}
