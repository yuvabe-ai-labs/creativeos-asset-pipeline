import { apiOk } from "@/lib/api/route-helpers";
import { listClientsWithMoodboards } from "@/lib/db/moodboards";

export async function GET() {
  const clients = await listClientsWithMoodboards();
  return apiOk({ clients });
}
