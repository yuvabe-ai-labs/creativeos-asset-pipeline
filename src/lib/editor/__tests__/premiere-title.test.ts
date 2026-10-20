import { describe, expect, it } from "vitest";
import { encodeSourceText, hexToInt, sourceTextJson, titleClipitem } from "../premiere-title";
import { rateParts, serialize } from "../xml-node";

describe("Premiere titles", () => {
  it("encodes title text the way Premiere stores it (u32 byte length, 4 zero bytes, UTF-16LE JSON)", () => {
    const b64 = encodeSourceText(
      sourceTextJson("Hello\nworld", { fontPostScript: "Montserrat-ExtraBold", sizePx: 56, color: "#ffffff" }),
    );
    const bytes = Buffer.from(b64, "base64");
    expect(bytes.readUInt32LE(0)).toBe(bytes.length - 8);
    expect(bytes.readUInt32LE(4)).toBe(0);
    const sheet = JSON.parse(bytes.subarray(8).toString("utf16le")).mTextParam.mStyleSheet;
    expect(sheet.mText).toBe("Hello\rworld");
    expect(sheet.mFontName.mParamValues).toEqual([[0, "Montserrat-ExtraBold"], [11, "Montserrat-ExtraBold"]]);
    expect(sheet.mFontSize.mParamValues).toEqual([[0, 56]]);
    expect(sheet.mFillColor.mParamValues[0]).toEqual([0, 0xffffff]);
    const param = JSON.parse(bytes.subarray(8).toString("utf16le")).mTextParam;
    expect(param.mBackFillVisible).toBe(false);
    expect(param.mShadowVisible).toBe(true);
  });

  it("writes one Graphic clipitem with Position as x:y", () => {
    const xml = serialize(
      titleClipitem({
        n: 1,
        title: { text: "Hi", fontPostScript: "Anton-Regular", sizePx: 80, color: "#ff8800", x: 0.25, y: 0.3 },
        start: 24,
        end: 72,
        fps: 24,
        width: 720,
        height: 1280,
      }),
    );
    expect(xml).toContain("<mediaSource>GraphicAndType</mediaSource>");
    expect(xml).toContain("<start>24</start>");
    expect(xml).toContain("<end>72</end>");
    expect(xml).toContain("<out>48</out>");
    expect(xml).toContain("-91445760000000000,0.25:0.3,0,0,0,0,0,0,5,4,0,0,0,0");
  });

  it("reads colours and rates", () => {
    expect(hexToInt("#ff8800")).toBe(0xff8800);
    expect(hexToInt("bad")).toBe(0xffffff);
    expect(rateParts(23.976)).toEqual({ timebase: 24, ntsc: true });
    expect(rateParts(25)).toEqual({ timebase: 25, ntsc: false });
  });
});
