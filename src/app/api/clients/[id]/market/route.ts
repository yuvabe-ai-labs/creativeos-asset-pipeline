import { NextRequest } from "next/server";
import { apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { ensureSystemBoards, listItems } from "@/lib/db/moodboards";
import { listSignalsWithItems } from "@/lib/db/signals";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load market data.", async () => {
      const { direct, adjacent } = await ensureSystemBoards(clientId);
      const [directItems, adjacentItems, signals] = await Promise.all([
        listItems(direct.id),
        listItems(adjacent.id),
        listSignalsWithItems(clientId),
      ]);
      return apiOk({
        direct: { board: direct, items: directItems },
        adjacent: { board: adjacent, items: adjacentItems },
        signals,
      });
    }),
  );
}
