import { describe, it, expect } from "vitest";
import { mp3DurationSeconds } from "../mp3";

/** `count` MPEG-1 Layer III frames at 128 kbps / 44.1 kHz — 417 bytes, 1152 samples each. */
function mpeg1Frames(count: number): Buffer {
  const frame = Buffer.alloc(417);
  frame[0] = 0xff;
  frame[1] = 0xfb; // MPEG-1, Layer III, no CRC
  frame[2] = 0x90; // bitrate index 9 (128 kbps), 44.1 kHz, no padding
  frame[3] = 0x00;
  return Buffer.concat(Array.from({ length: count }, () => frame));
}

function id3Tag(bodySize: number): Buffer {
  const tag = Buffer.alloc(10 + bodySize);
  tag.write("ID3", 0, "latin1");
  tag[3] = 4;
  // Syncsafe size: 7 bits per byte.
  tag[6] = (bodySize >> 21) & 0x7f;
  tag[7] = (bodySize >> 14) & 0x7f;
  tag[8] = (bodySize >> 7) & 0x7f;
  tag[9] = bodySize & 0x7f;
  return tag;
}

describe("mp3DurationSeconds", () => {
  it("adds up the frames: 100 frames of 1152 samples at 44.1 kHz", () => {
    expect(mp3DurationSeconds(mpeg1Frames(100))).toBeCloseTo((100 * 1152) / 44100, 3);
  });

  it("skips a leading ID3v2 tag, even one holding bytes that look like a frame", () => {
    const tag = id3Tag(300);
    tag[20] = 0xff;
    tag[21] = 0xfb;
    tag[22] = 0x90;
    expect(mp3DurationSeconds(Buffer.concat([tag, mpeg1Frames(50)]))).toBeCloseTo((50 * 1152) / 44100, 3);
  });

  it("is 0 for something that is not an mp3", () => {
    expect(mp3DurationSeconds(Buffer.from("not audio at all"))).toBe(0);
    expect(mp3DurationSeconds(Buffer.alloc(0))).toBe(0);
  });
});
