import "server-only";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { createOpenAI } from "@/lib/openai/server";
import { listKBDocuments, listBrandImages } from "@/lib/db/kb";
import {
  TraceableBrandKBSchema,
  ImageAnalysisSchema,
  defaultEmptyImageAnalysis,
  type TraceableBrandKB,
} from "@/lib/kb/schema";
import { computeFillRate } from "@/lib/kb/fill-rate";
import { KB_DOC_PER_FILE_LIMIT_BYTES } from "@/lib/kb/constants";
import { kbExtractPrompt } from "@/prompts/kb-extract";
import { kbImageAnalyzePrompt } from "@/prompts/kb-image-analyze";
import { websiteResearchPrompt } from "@/prompts/website-research";
import type { KBAnalysisProvider } from "./interface";

const TEXT_EXTENSIONS = new Set(["md", "txt"]);
const FILE_EXTENSIONS = new Set(["pdf", "docx", "pptx"]);

const DocExtractionSchema = TraceableBrandKBSchema.omit({ image_analysis: true });
type DocExtractionResult = z.infer<typeof DocExtractionSchema>;


export const openaiKBProvider: KBAnalysisProvider = {
  async extractKB({ clientId, docIds, researchMarkdown }) {
    const allDocs = await listKBDocuments(clientId);
    const docs = allDocs.filter((d) => docIds.includes(d.id));

    const skipped: { filename: string; reason: string }[] = [];
    const docUserContent: unknown[] = [];
    for (const doc of docs) {
      if (FILE_EXTENSIONS.has(doc.file_ext)) {
        if (doc.size_bytes > KB_DOC_PER_FILE_LIMIT_BYTES) {
          skipped.push({ filename: doc.filename, reason: "exceeds 1 MB per-file limit" });
          continue;
        }
        docUserContent.push({ type: "input_file", file_url: doc.storage_url });
      } else if (TEXT_EXTENSIONS.has(doc.file_ext)) {
        const res = await fetch(doc.storage_url);
        if (!res.ok) throw new Error(`Could not fetch document: ${doc.filename}`);
        docUserContent.push({ type: "input_text", text: await res.text() });
      }
    }
    if (researchMarkdown) {
      docUserContent.push({
        type: "input_text",
        text: `--- Brand website research ---\n${researchMarkdown}`,
      });
    }
    docUserContent.push({
      type: "input_text",
      text: "Extract all brand knowledge from the documents above. Where multiple files cover the same brand, merge the information using UNION logic for lists and preferring the more specific value for strings.",
    });

    const openai = createOpenAI();
    const docResponse = await openai.responses.parse({
      model: kbExtractPrompt.model,
      input: [
        { role: "system", content: kbExtractPrompt.system },
        { role: "user", content: docUserContent as never },
      ],
      text: { format: zodTextFormat(DocExtractionSchema, "brand_kb") },
      temperature: 0.5,
    });

    const docKB = docResponse.output_parsed as DocExtractionResult | null;
    if (!docKB) throw new Error("Model returned no parsed output.");

    const kbOutput: TraceableBrandKB = {
      ...docKB,
      image_analysis: defaultEmptyImageAnalysis(),
    };

    return {
      kbOutput,
      modelUsed: kbExtractPrompt.model,
      fillRate: computeFillRate(kbOutput),
      skipped,
    };
  },

  async analyzeImages({ clientId, imageIds }) {
    const allImages = await listBrandImages(clientId);
    const images = allImages.filter((i) => imageIds.includes(i.id));

    if (images.length === 0) return defaultEmptyImageAnalysis();

    const imageUserContent: unknown[] = images.map((img) => ({
      type: "input_image",
      image_url: img.storage_url,
    }));
    imageUserContent.push({
      type: "input_text",
      text: "Analyze all provided brand images and extract visual identity signals for the image_analysis section.",
    });

    const openai = createOpenAI();
    const imageResponse = await openai.responses.parse({
      model: kbImageAnalyzePrompt.model,
      input: [
        { role: "system", content: kbImageAnalyzePrompt.system },
        { role: "user", content: imageUserContent as never },
      ],
      text: { format: zodTextFormat(ImageAnalysisSchema, "image_analysis") },
      temperature: 0.3,
    });

    return imageResponse.output_parsed ?? defaultEmptyImageAnalysis();
  },

  async researchWebsite(url) {
    const openai = createOpenAI();
    const res = await openai.responses.create({
      model: websiteResearchPrompt.model,
      input: [
        { role: "system", content: websiteResearchPrompt.system },
        { role: "user", content: `Brand website: ${url}` },
      ],
      tools: [{ type: "web_search" }],
    });
    const md = res.output_text?.trim();
    if (!md) throw new Error(`Website research returned no content for ${url}`);
    return md;
  },
};
