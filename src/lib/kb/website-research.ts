import "server-only";
import { getKBProvider } from "@/lib/kb/providers/interface";
import type { RecordFor } from "@/lib/generations/record-for";

export async function researchBrandWebsite(url: string, recordFor?: RecordFor): Promise<string> {
  return getKBProvider().researchWebsite(url, recordFor);
}
