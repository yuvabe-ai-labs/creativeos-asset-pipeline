import "server-only";
import { getKBProvider } from "@/lib/kb/providers/interface";

export async function researchBrandWebsite(url: string): Promise<string> {
  return getKBProvider().researchWebsite(url);
}
