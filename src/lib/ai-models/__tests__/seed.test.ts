import { describe, it, expect } from "vitest";
import { seedSql, type AiModelSeedRow } from "../seed";

const rows: AiModelSeedRow[] = [
  {
    id: "acme:pic-1", provider: "acme", kind: "image", label: "Pic 1", picker_label: null, provider_label: "Acme",
    status: "live", replaced_by: null, sort_order: 0, adapter_key: "image:acme", params: [], rules: [], capabilities: {},
  },
  {
    id: "acme:vid-1", provider: "acme", kind: "video", label: "Vid 1", picker_label: "Vid", provider_label: "Acme",
    status: "retired", replaced_by: "acme:vid-2", sort_order: 1, adapter_key: "video:acme", params: [], rules: [], capabilities: {},
  },
];

describe("seedSql", () => {
  it("embeds the rows as JSON inside the $seed$ tag and inserts with on conflict do nothing", () => {
    const sql = seedSql(rows, ["-- test header"]);
    const json = sql.slice(sql.indexOf("$seed$") + 6, sql.lastIndexOf("$seed$"));
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(rows)));
    expect(sql).toContain("insert into ai_models");
    expect(sql).toContain("on conflict (id) do nothing");
  });
});
