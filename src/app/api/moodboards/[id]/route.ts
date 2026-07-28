import { NextRequest } from "next/server";
import { apiOk } from "@/lib/api/route-helpers";
import { deleteMoodboard } from "@/lib/db/moodboards";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteMoodboard(id);
  return apiOk({ ok: true });
}
