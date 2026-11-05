import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { addToCachedUpstream, nodeUpstreamKeys } from "./node-upstream";
import type { NodeUpstream } from "@/services/node-upstream.service";

const NODE = "gen-1";
const key = nodeUpstreamKeys.detail(NODE);
const image = (id: string) => ({ id, type: "file", imageUrl: `https://x/${id}.png` });
const ids = (client: QueryClient) => client.getQueryData<NodeUpstream>(key)?.images.map((i) => i.id);

function seeded() {
  const client = new QueryClient();
  client.setQueryData<NodeUpstream>(key, { images: [image("a")], promptNode: null });
  return client;
}

describe("addToCachedUpstream", () => {
  it("adds the row after the ones already listed", () => {
    const client = seeded();
    addToCachedUpstream(client, NODE, image("b"));
    expect(ids(client)).toEqual(["a", "b"]);
  });

  it("does not list a row twice", () => {
    const client = seeded();
    addToCachedUpstream(client, NODE, image("a"));
    expect(ids(client)).toEqual(["a"]);
  });

  it("does nothing with no list cached, so the view keeps its skeleton", () => {
    const client = new QueryClient();
    addToCachedUpstream(client, NODE, image("b"));
    expect(client.getQueryData(key)).toBeUndefined();
  });

  // A read started before the wire existed cannot know about it. Landing after the add, it would
  // take the row off the list again until the confirming read returned.
  it("is not undone by a read that started before the add", async () => {
    const client = seeded();
    let finishOldRead: (value: NodeUpstream) => void = () => {};
    const oldRead = client
      .fetchQuery({
        queryKey: key,
        queryFn: () => new Promise<NodeUpstream>((resolve) => { finishOldRead = resolve; }),
      })
      .catch(() => undefined);

    addToCachedUpstream(client, NODE, image("b"));
    finishOldRead({ images: [image("a")], promptNode: null });
    await oldRead;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ids(client)).toEqual(["a", "b"]);
  });
});
