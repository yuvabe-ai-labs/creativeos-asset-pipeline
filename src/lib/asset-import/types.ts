import type { JobStatus } from "@/lib/jobs/types";
import type { ImportSource } from "./constants";

/** One image or video a scraper found, before it is downloaded. Provider URLs are short-lived. */
export type ScrapedAsset = {
  source: ImportSource;
  mediaType: "image" | "video";
  url: string;
  /** A video's poster still. */
  thumbnailUrl?: string;
  /** The post permalink or page it was found on. */
  sourceUrl?: string;
  /** ISO time the brand posted it (social only). */
  postedAt?: string;
  /** Dedupe key (D305). */
  ref: string;
  alt?: string;
};

/** What a normalizer returns: the assets, or why the source produced none. */
export type NormalizeResult = {
  assets: ScrapedAsset[];
  /** Why the source produced nothing, worded for people. */
  error?: string;
  /** The provider's code for it (e.g. "no_items"), for decisions in code, never for display. */
  errorCode?: string;
};

/** An `asset-import` background job's input and result (D306). */
export type AssetImportInput = { source: ImportSource; target: string };
export type AssetImportResult = {
  assetCount: number;
  found: number;
  failed: number;
  /** The date a social refresh fetched from; null for a full fetch (D302). */
  since?: string | null;
};

/** One source's latest import, as the browser sees it. */
export type AssetImport = {
  id: string;
  source: ImportSource;
  target: string;
  status: JobStatus;
  phaseMessage: string | null;
  assetCount: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  /** When this source last imported successfully from this same target — what a social refresh
   *  builds on. Null when it never has. */
  lastSucceededAt: string | null;
};
