// Captions as Premiere Pro TITLES (Essential Graphics "Graphic" clips) inside the
// FCP7 XML, so they land in the sequence as their own styled layer instead of as a sidecar
// SRT that Premiere imports as a plain caption track.
//
// UNDOCUMENTED + reverse-engineered from a real Premiere export (OpenTimelineIO's
// otio-fcp-adapter test fixture tests/sample_data/premiere_generators.xml, clipitem-6):
//  - the clip is a <clipitem> whose <file> has <mediaSource>GraphicAndType</mediaSource>
//  - styling lives in a <filter><effect> with <effectid>GraphicAndType</effectid>
//  - parameter 1 "Source Text" is base64 of: u32 LE byte length, 4 zero bytes, then the
//    UTF-16LE JSON below (no terminator). Per-character style runs are [charIndex, value];
//    multi-run properties end with a run at index = text length.
//  - parameter 3 "Position" is normalised x:y (0–1) of the frame.
// Colours are 0xRRGGBB integers. Premiere may read this differently in a future version: re-check
// with __tests__/caption-probe.test.ts (D392).
import { rate, timecode, x, type XNode } from "./xml-node";

/** What one caption looks like as a Premiere title. sizePx is at the sequence's frame size. */
export type TitleSpec = { text: string; fontPostScript: string; sizePx: number; color: string; x: number; y: number };
type TitleStyle = Pick<TitleSpec, "fontPostScript" | "sizePx" | "color">;

const PARAM_TIME = "-91445760000000000";
/** Generator length Premiere wrote for a title (frames); in/out sit inside it. */
const GRAPHIC_DURATION = 1035764;
/** mAlignment observed for a centre-aligned title. Left/right values are unverified. */
const ALIGN_CENTER = 2;

export function hexToInt(hex: string): number {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  return m ? parseInt(m[1], 16) : 0xffffff;
}

const run = <T>(value: T) => ({ mParamValues: [[0, value]] });
const runs = <T>(value: T, length: number) => ({ mParamValues: [[0, value], [length, value]] });

export function sourceTextJson(text: string, style: TitleStyle) {
  const mText = text.replace(/\r?\n/g, "\r");
  const n = mText.length;
  return {
    mShadowFontMapHash: crypto.randomUUID(),
    mTextParam: {
      mAlignment: ALIGN_CENTER,
      mBackFillColor: 0x000000,
      mBackFillOpacity: 60,
      mBackFillSize: 0,
      mBackFillVisible: false,
      mDefaultRun: [],
      mHeight: 0,
      mHindiDigits: false,
      mIndic: false,
      mIsMask: false,
      mIsMaskInverted: false,
      mIsVerticalText: false,
      mLeading: 0,
      mLigatures: false,
      mLineCapType: 0,
      mLineJoinType: 0,
      mMiterLimit: 2.5,
      mNumStrokes: 1,
      mRTL: false,
      // No box: a soft drop shadow keeps light text readable over bright frames.
      mShadowAngle: 90,
      mShadowBlur: 30,
      mShadowColor: 0x000000,
      mShadowOffset: 3,
      mShadowOpacity: 60,
      mShadowSize: 0,
      mShadowVisible: true,
      mStyleSheet: {
        mAdditionalStrokeColor: [],
        mAdditionalStrokeVisible: [],
        mAdditionalStrokeWidth: [],
        mBaselineOption: run(0),
        mBaselineShift: run(0),
        mCapsOption: run(0),
        mFauxBold: run(false),
        mFauxItalic: run(false),
        mFillColor: runs(hexToInt(style.color), n),
        mFillOverStroke: run(true),
        mFillVisible: run(true),
        mFontName: runs(style.fontPostScript, n),
        mFontSize: run(style.sizePx),
        mKerning: run(0),
        mStrokeColor: runs(0x000000, n),
        mStrokeVisible: runs(false, n),
        mStrokeWidth: run(1),
        mText,
        mTracking: run(0),
        mTsumi: run(0),
        mUnderline: run(false),
      },
      mTabWidth: 400,
      mVerticalAlignment: 0,
      mWidth: 0,
    },
    mUseLegacyTextBox: false,
    mVersion: 1,
  };
}

/** base64( u32 LE byteLength | u32 0 | UTF-16LE JSON ) */
export function encodeSourceText(json: unknown): string {
  const s = JSON.stringify(json);
  const bytes = new Uint8Array(8 + s.length * 2);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, s.length * 2, true);
  for (let i = 0; i < s.length; i++) view.setUint16(8 + i * 2, s.charCodeAt(i), true);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

type ParamSpec = { id: number; name: string; ct?: number; lo?: string; up?: string; value: string };

/** The 21 parameters Premiere wrote for a title, in order; only Source Text + Position vary. */
function titleParams(sourceText: string, posX: number, posY: number): XNode[] {
  const plain = (v: string) => `${PARAM_TIME},${v},0,0,0,0,0,0`;
  const specs: ParamSpec[] = [
    { id: 2, name: "Transform", ct: 11, lo: "false", up: "false", value: plain("false") },
    { id: 3, name: "Position", value: `${PARAM_TIME},${posX}:${posY},0,0,0,0,0,0,5,4,0,0,0,0` },
    { id: 4, name: "Scale", ct: 2, lo: "0", up: "4000", value: plain("100.") },
    { id: 5, name: "Horizontal Scale", ct: 2, lo: "0", up: "4000", value: plain("100.") },
    { id: 6, name: " ", ct: 4, lo: "false", up: "true", value: plain("true") },
    { id: 7, name: "Rotation", ct: 3, lo: "-32768", up: "32767", value: plain("0.") },
    { id: 8, name: "Opacity", ct: 2, lo: "0", up: "100", value: plain("100.") },
    { id: 9, name: "Anchor Point", value: `${PARAM_TIME},0:0,0,0,0,0,0,0,5,4,0,0,0,0` },
    { id: 10, name: "", ct: 12, lo: "false", up: "false", value: plain("false") },
    { id: 11, name: " ", ct: 8, lo: "0", up: "32768", value: plain("0.") },
    { id: 12, name: " ", ct: 8, lo: "0", up: "32768", value: plain("0.") },
    { id: 13, name: "start", ct: 8, lo: "-100", up: "1000000000", value: plain("69.") },
    { id: 14, name: "end", ct: 8, lo: "-100", up: "1000000000", value: plain("69.") },
    { id: 15, name: " ", ct: 4, lo: "false", up: "true", value: plain("false") },
    { id: 16, name: " ", ct: 4, lo: "false", up: "true", value: plain("false") },
    { id: 17, name: " ", ct: 4, lo: "false", up: "true", value: plain("false") },
    { id: 18, name: " ", ct: 4, lo: "false", up: "true", value: plain("false") },
    { id: 19, name: "Parent Width", ct: 2, lo: "0", up: "20000", value: plain("0.") },
    { id: 20, name: "Parent Height", ct: 2, lo: "0", up: "20000", value: plain("0.") },
    { id: 21, name: "Parent Rotation", ct: 3, lo: "-32768", up: "32767", value: plain("0.") },
  ];
  const author = { authoringApp: "PremierePro" };
  return [
    x("parameter", author,
      x("parameterid", null, 1),
      x("name", null, "Source Text"),
      x("hash", null, crypto.randomUUID()),
      x("value", null, sourceText),
    ),
    ...specs.map((p) =>
      x("parameter", author,
        x("parameterid", null, p.id),
        x("name", null, p.name),
        x("IsTimeVarying", null, "false"),
        p.ct !== undefined && x("ParameterControlType", null, p.ct),
        p.lo !== undefined && x("LowerBound", null, p.lo),
        p.up !== undefined && x("UpperBound", null, p.up),
        x("value", null, p.value),
      ),
    ),
  ];
}

/** One caption → one Graphic clipitem on the captions video track. Times are sequence frames. */
export function titleClipitem(opts: {
  n: number;
  title: TitleSpec;
  start: number;
  end: number;
  fps: number;
  width: number;
  height: number;
}): XNode {
  const { n, title, start, end, fps, width, height } = opts;
  const sourceText = encodeSourceText(sourceTextJson(title.text, title));
  return x("clipitem", { id: `clipitem-t${n}` },
    x("masterclipid", null, `masterclip-t${n}`),
    x("name", null, "Graphic"),
    x("enabled", null, "TRUE"),
    x("duration", null, GRAPHIC_DURATION),
    rate(fps),
    x("start", null, start),
    x("end", null, end),
    x("in", null, 0),
    x("out", null, end - start),
    x("alphatype", null, "straight"),
    x("pixelaspectratio", null, "square"),
    x("anamorphic", null, "FALSE"),
    x("file", { id: `file-t${n}` },
      x("name", null, "Graphic"),
      x("mediaSource", null, "GraphicAndType"),
      rate(fps),
      timecode(fps),
      x("media", null,
        x("video", null,
          x("samplecharacteristics", null,
            rate(fps), x("width", null, width), x("height", null, height),
            x("anamorphic", null, "FALSE"), x("pixelaspectratio", null, "square"), x("fielddominance", null, "none"),
          ),
        ),
      ),
    ),
    x("filter", null,
      x("effect", null,
        x("name", null, title.text),
        x("effectid", null, "GraphicAndType"),
        x("effectcategory", null, "graphic"),
        x("effecttype", null, "filter"),
        x("mediatype", null, "video"),
        x("pproBypass", null, "false"),
        ...titleParams(sourceText, title.x, title.y),
      ),
    ),
  );
}
