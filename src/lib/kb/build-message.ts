export function buildExtractingMessage(p: {
  hasResearch: boolean;
  docCount: number;
  imgCount: number;
}): string {
  const docNoun = (n: number) => (n === 1 ? "document" : "documents");
  const imgNoun = (n: number) => (n === 1 ? "image" : "images");
  const docPart = p.docCount > 0 ? `${p.docCount} ${docNoun(p.docCount)}` : null;
  const imgPart = p.imgCount > 0 ? `${p.imgCount} ${imgNoun(p.imgCount)}` : null;

  if (p.hasResearch && !docPart && !imgPart) return "Reading website research…";
  if (docPart && imgPart) return `Reading ${docPart} and analyzing ${imgPart}…`;
  if (docPart) return `Reading ${docPart}…`;
  if (imgPart) return `Analyzing ${imgPart}…`;
  return "Building knowledge base…";
}
