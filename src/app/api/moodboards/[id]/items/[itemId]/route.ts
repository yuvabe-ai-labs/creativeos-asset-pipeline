import { NextRequest } from "next/server";
import { apiOk } from "@/lib/api/route-helpers";
import { removeItem } from "@/lib/db/moodboards";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { itemId } = await params;
  await removeItem(itemId);
  return apiOk({ ok: true });
}
