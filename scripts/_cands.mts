// Temporary. Delete after use.
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ids = { coca: "fba7fa6d-8180-4d61-b657-a216e3094d35", j365: "ba5013fe-e92d-493b-9962-df6b82b6e81e", madras: "e5d4fb0f-6e3f-40af-9a51-34fa8357e0cf", penguin: "6dc4f5fc-1a6a-4847-8e02-70ada3db4786" };
const { data: one } = await db.from("client_brand_images").select("*").eq("client_id", ids.coca).eq("media_type", "video").limit(1);
console.log(Object.keys(one![0]).join(", "));
for (const [k, id] of Object.entries(ids)) {
  const { data } = await db.from("client_brand_images").select("*").eq("client_id", id).eq("media_type", "video").eq("source", "instagram").order("posted_at", { ascending: false }).limit(12);
  console.log("\n==", k);
  for (const r of data as any[]) console.log([r.id, r.source_url ?? r.post_url ?? r.permalink, r.duration_s ?? r.duration_seconds ?? r.duration, r.size_bytes, (r.caption ?? "").replace(/\s+/g, " ").slice(0, 70)].join(" | "));
}
