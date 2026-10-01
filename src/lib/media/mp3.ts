// D299 — an mp3's length, read from its frame headers. Pure, with no ffmpeg: the voice route
// runs in the web server, where the ffmpeg binary the Trigger tasks use is not installed. Every
// frame header states its bitrate and sample rate, so walking the frames gives the duration of a
// constant- or variable-bitrate file alike. MPEG-1, 2 and 2.5 Layer III — what ElevenLabs returns.

const BITRATES_KBPS = {
  mpeg1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  mpeg2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
} as const;

const SAMPLE_RATES = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
} as const;

/** Where the audio starts: past an ID3v2 tag, whose size is stored "syncsafe" (7 bits a byte). */
function audioStart(buf: Buffer): number {
  if (buf.length < 10 || buf.toString("latin1", 0, 3) !== "ID3") return 0;
  const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  const footer = (buf[5] & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

export function mp3DurationSeconds(buf: Buffer): number {
  let seconds = 0;
  let i = audioStart(buf);
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) {
      i += 1;
      continue;
    }
    const version = (buf[i + 1] >> 3) & 0x03; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5, 1 = reserved
    const layer = (buf[i + 1] >> 1) & 0x03; // 1 = Layer III
    const bitrateIndex = (buf[i + 2] >> 4) & 0x0f;
    const rateIndex = (buf[i + 2] >> 2) & 0x03;
    const padding = (buf[i + 2] >> 1) & 0x01;
    if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
      i += 1;
      continue;
    }
    const mpeg1 = version === 3;
    const kbps = (mpeg1 ? BITRATES_KBPS.mpeg1 : BITRATES_KBPS.mpeg2)[bitrateIndex];
    const sampleRate = SAMPLE_RATES[version as 3 | 2 | 0][rateIndex];
    const samples = mpeg1 ? 1152 : 576;
    const length = Math.floor(((mpeg1 ? 144_000 : 72_000) * kbps) / sampleRate) + padding;
    if (length < 4) {
      i += 1;
      continue;
    }
    seconds += samples / sampleRate;
    i += length;
  }
  return seconds;
}
