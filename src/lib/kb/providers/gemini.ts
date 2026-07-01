import "server-only";
import { zodToJsonSchema } from "zod-to-json-schema";
import { createGemini } from "@/lib/gemini/server";
import { listKBDocuments, listBrandImages } from "@/lib/db/kb";
import {
  TraceableBrandKBSchema,
  ImageAnalysisSchema,
  type TraceableBrandKB,
  type KBField,
} from "@/lib/kb/schema";
import { computeFillRate } from "@/lib/kb/fill-rate";
import { geminiKbExtractPrompt } from "@/prompts/gemini-kb-extract";
import { geminiKbImageAnalyzePrompt } from "@/prompts/gemini-kb-image-analyze";
import { geminiWebsiteResearchPrompt } from "@/prompts/gemini-website-research";
import type { KBAnalysisProvider } from "./interface";

const DocExtractionSchema = TraceableBrandKBSchema.omit({ image_analysis: true });

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const IMG_MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function emptyKBField<T>(value: T | null = null): KBField<T> {
  return { value, confidence: "low", evidence_type: "inferred", status: "needs_review" };
}

function defaultEmptyImageAnalysis(): TraceableBrandKB["image_analysis"] {
  return {
    dominant_colors: emptyKBField<string[]>(null),
    visual_mood: emptyKBField<string>(null),
    aesthetic: emptyKBField<string>(null),
    subjects: emptyKBField<string>(null),
    composition_style: emptyKBField<string>(null),
    lighting_character: emptyKBField<string>(null),
    brand_consistency_notes: emptyKBField<string>(null),
  };
}

async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const buffer = await res.arrayBuffer();
  return { data: Buffer.from(buffer).toString("base64"), mimeType: contentType };
}

async function fetchAsText(url: string, filename: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch document: ${filename}`);
  return res.text();
}

export const geminiKBProvider: KBAnalysisProvider = {
  async extractKB({ clientId, docIds, researchMarkdown }) {
    const allDocs = await listKBDocuments(clientId);
    const docs = allDocs.filter((d) => docIds.includes(d.id));

    const parts: unknown[] = [];

    for (const doc of docs) {
      const binaryMime = MIME_BY_EXT[doc.file_ext];
      if (binaryMime) {
        const { data } = await fetchAsBase64(doc.storage_url);
        parts.push({ inlineData: { mimeType: binaryMime, data } });
      } else {
        // md / txt
        const text = await fetchAsText(doc.storage_url, doc.filename);
        parts.push({ text });
      }
    }

    if (researchMarkdown) {
      parts.push({ text: `--- Brand website research ---\n${researchMarkdown}` });
    }

    parts.push({
      text: "Extract all brand knowledge from the documents above. Where multiple files cover the same brand, merge the information using UNION logic for lists and preferring the more specific value for strings.",
    });

    const ai = createGemini();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (ai.models as any).generateContent({
      model: geminiKbExtractPrompt.model,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: geminiKbExtractPrompt.system,
        responseMimeType: "application/json",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        responseSchema: zodToJsonSchema(DocExtractionSchema as any),
        temperature: 0.5,
      },
    });

    const raw = response.text ?? "";
    if (!raw) throw new Error("Gemini KB extract returned no content.");
    const docKB = JSON.parse(raw);

    const kbOutput: TraceableBrandKB = {
      ...docKB,
      image_analysis: defaultEmptyImageAnalysis(),
    };

    return {
      kbOutput,
      modelUsed: geminiKbExtractPrompt.model,
      fillRate: computeFillRate(kbOutput),
    };
  },

  async analyzeImages({ clientId, imageIds }) {
    const allImages = await listBrandImages(clientId);
    const images = allImages.filter((i) => imageIds.includes(i.id));

    if (images.length === 0) return defaultEmptyImageAnalysis();

    const parts: unknown[] = [];
    for (const img of images) {
      const ext = img.filename.split(".").pop()?.toLowerCase() ?? "jpg";
      const mimeType = IMG_MIME_BY_EXT[ext] ?? "image/jpeg";
      const { data } = await fetchAsBase64(img.storage_url);
      parts.push({ inlineData: { mimeType, data } });
    }
    parts.push({
      text: "Analyze all provided brand images and extract visual identity signals for the image_analysis section.",
    });

    const ai = createGemini();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (ai.models as any).generateContent({
      model: geminiKbImageAnalyzePrompt.model,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: geminiKbImageAnalyzePrompt.system,
        responseMimeType: "application/json",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        responseSchema: zodToJsonSchema(ImageAnalysisSchema as any),
        temperature: 0.3,
      },
    });

    const raw = response.text ?? "";
    if (!raw) return defaultEmptyImageAnalysis();
    return JSON.parse(raw) as TraceableBrandKB["image_analysis"];
  },

  async researchWebsite(url) {
    const ai = createGemini();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (ai.models as any).generateContent({
      model: geminiWebsiteResearchPrompt.model,
      contents: [{ role: "user", parts: [{ text: `Brand website: ${url}` }] }],
      config: {
        systemInstruction: geminiWebsiteResearchPrompt.system,
        tools: [{ googleSearch: {} }],
      },
    });
    const md = response.text?.trim();
    if (!md) throw new Error(`Website research returned no content for ${url}`);
    return md;
  },
};
