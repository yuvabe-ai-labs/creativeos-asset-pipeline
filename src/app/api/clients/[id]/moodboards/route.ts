import { NextRequest } from "next/server";
import { apiError, apiOk, withClient } from "@/lib/api/route-helpers";
import { listMoodboards, createMoodboard } from "@/lib/db/moodboards";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) => {
    const moodboards = await listMoodboards(clientId);
    return apiOk({ moodboards });
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) => {
    let body: { name?: string };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }
    const name = body.name?.trim();
    if (!name) return apiError("name is required", 400);
    const moodboard = await createMoodboard(clientId, name);
    return apiOk({ moodboard }, 201);
  });
}
