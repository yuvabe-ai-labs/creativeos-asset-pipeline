// A tiny XML tree + serializer and the FCP7 rate/timecode elements, shared by the
// sequence writer (premiere-xml.ts) and the title writer (premiere-title.ts).

export type XNode = { tag: string; attrs?: Record<string, string>; children: Array<XNode | string> };
type Child = XNode | string | number | null | false | undefined;

export const x = (tag: string, attrs: Record<string, string> | null, ...children: Child[]): XNode => ({
  tag,
  attrs: attrs ?? undefined,
  children: children
    .filter((c): c is XNode | string | number => c !== null && c !== false && c !== undefined)
    .map((c) => (typeof c === "number" ? String(c) : c)),
});

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\r/g, "&#13;");

export function serialize(node: XNode, depth = 0): string {
  const pad = "  ".repeat(depth);
  const attrs = node.attrs
    ? Object.entries(node.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("")
    : "";
  if (node.children.length === 0) return `${pad}<${node.tag}${attrs}/>`;
  if (node.children.length === 1 && typeof node.children[0] === "string") {
    return `${pad}<${node.tag}${attrs}>${esc(node.children[0])}</${node.tag}>`;
  }
  const inner = node.children
    .map((c) => (typeof c === "string" ? `${pad}  ${esc(c)}` : serialize(c, depth + 1)))
    .join("\n");
  return `${pad}<${node.tag}${attrs}>\n${inner}\n${pad}</${node.tag}>`;
}

/** 23.976 → timebase 24 + NTSC; 25 → 25. */
export function rateParts(fps: number): { timebase: number; ntsc: boolean } {
  const timebase = Math.round(fps);
  const ntsc = Math.abs(fps - timebase) > 0.001 && Math.abs(fps - (timebase * 1000) / 1001) < 0.01;
  return { timebase, ntsc };
}

export const rate = (fps: number) => {
  const { timebase, ntsc } = rateParts(fps);
  return x("rate", null, x("timebase", null, timebase), x("ntsc", null, ntsc ? "TRUE" : "FALSE"));
};

export const timecode = (fps: number) =>
  x("timecode", null, rate(fps), x("string", null, "00:00:00:00"), x("frame", null, 0), x("displayformat", null, "NDF"));
