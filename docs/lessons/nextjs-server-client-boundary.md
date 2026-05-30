# Lesson — The Client/Server Boundary in Next.js

*Three tools, one decision — taught through one example: "Parse a brief."*

---

## The mental model

In a **classic SPA**, the browser is an outsider. The only way it reaches your server or
database is by knocking on an HTTP **endpoint**. So you build a door (endpoint) for *every*
interaction — read, write, everything.

In **Next.js**, your pages run **on the server**. They're already *inside the house*. So
they don't knock — they read the database directly. You only cut a real door for callers who
are genuinely **outside** your React app.

> **An endpoint is a public door. Only cut one where something external needs to knock.**

This gives you **three tools**, each for a different situation:

| Tool | What it is | Runs on | Client gets back |
|---|---|---|---|
| **Server Component** | A page/component that renders on the server | Server | **HTML** (data already inside) |
| **Server Action** | An async function you call from the client | Server | **one finished value** (RPC) |
| **Route Handler** | A real URL (`app/api/.../route.ts`) | Server | **an HTTP Response** (can be a *stream*) |

All three run on the server and can safely hold secrets. They differ in **how the client
talks to them**.

---

## The running example: "Parse a brief"

The Brief node has a **Parse** button. Clicking it: loads the node, compiles a payload,
calls the LLM (with a secret key), saves a version, sets it active. Let's implement the
*trigger* three ways and watch what changes.

### ❌ The SPA way (for contrast) — a hand-built endpoint + manual fetch

```ts
// You build the door:
// POST /api/nodes/:id/parse  → parse body, validate, call LLM, return JSON
```
```ts
// Client must knock with fetch + serialize + deserialize:
const res = await fetch(`/api/nodes/${id}/parse`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ /* ... */ }),
});
const version = await res.json();
```
You hand-write: the route, body parsing, validation, JSON in/out, *and* the client fetch.
Every operation in the app needs this.

### ✅ As a Server Action — "call a function, get a value" (no API)

```ts
// src/lib/actions/parse.ts
"use server";                                   // <- this runs ONLY on the server
import { db } from "@/lib/db";
import { compileBrief } from "@/lib/nodes/brief";
import { anthropic } from "@/lib/anthropic";

export async function parseBrief(nodeId: string) {
  const node = await db.nodes.get(nodeId);      // direct DB access
  const payload = compileBrief(node.data);      // pure compile fn
  const result = await anthropic.messages.create(payload); // secret stays here
  const version = await db.versions.append(nodeId, { /* envelope */ });
  await db.nodes.setActive(nodeId, version.id);
  return version;                               // ONE value back
}
```
```tsx
// BriefNode.tsx  ('use client')
import { parseBrief } from "@/lib/actions/parse";

<button onClick={async () => {
  const version = await parseBrief(node.id);    // just await a function
  // update UI with the finished result
}}>Parse</button>
```
**No URL. No fetch. No JSON.parse. No hand-built route.** You import a function and `await`
it; Next.js generates the network plumbing under the hood. The result comes back **whole,
once.** This is the simplest correct way to do a browser-triggered mutation.

### ✅ As a Route Handler — "open a URL, read a stream" (a real endpoint)

```ts
// src/app/api/nodes/[id]/parse/route.ts
import { db } from "@/lib/db";
import { compileBrief } from "@/lib/nodes/brief";
import { anthropic } from "@/lib/anthropic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const node = await db.nodes.get(params.id);
  const payload = compileBrief(node.data);
  const stream = anthropic.messages.stream(payload);   // secret stays here
  return new Response(stream.toReadableStream());      // a LIVE stream
}
```
```tsx
// client
const res = await fetch(`/api/nodes/${id}/parse`, { method: "POST" });
const reader = res.body!.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // append chunk → tokens appear in the UI as they're generated
}
```
Now the client reads **chunks over time** → the parsed output streams in token-by-token.
And because this is a real public URL, an external caller (e.g. a video provider's
**webhook** in Stage 4) can POST to it too.

---

## The one decision

```
Does a caller OUTSIDE your own React app need to hit this over HTTP?
│
├─ It's a page reading data to display      → SERVER COMPONENT   (no endpoint)
│
├─ It's your UI writing/mutating, and you
│  just need the finished result back       → SERVER ACTION      (a function)
│
└─ You need streaming, a webhook, a file
   response, or a non-React/external caller  → ROUTE HANDLER      (a real door)
```

For **Parse** specifically: a Server Action is the simplest choice. We pick a **Route
Handler** when we want (a) token **streaming** into the UI, or (b) the same pattern that
Stage 4's video **webhooks** will *require*. Both are correct; the choice is about the
client's needs, not the server's logic — the logic is identical.

---

## Why this "shrinks the backend"

A classic SPA backend for this app = ~12 endpoints (list/get/create clients, canvases,
nodes; save positions; parse; versions; restore) — each one routing + validation +
serialization + a matching client fetch hook.

The Next.js version:
- **All reads** → Server Components reading the DB. **Zero endpoints.**
- **All writes** → Server Actions. **Functions, not endpoints.**
- **~1 real Route Handler** (Parse), and only because we want streaming/webhook semantics.

The expensive part of a backend was never the business logic — it was the **dozen-endpoint
API surface**. Next.js deletes most of that surface.

---

## The streaming nuance (precisely)

Streaming output is **always produced on the server** — that part doesn't change between a
Server Action and a Route Handler. What changes is the **transport to the client**:

- A **Server Action returns when the function returns** → the client gets **one resolved
  value**. To show tokens appearing live, you'd be waiting for the whole thing.
- A **Route Handler returns a `Response`**, and a `Response` body can be a **`ReadableStream`**
  → the client reads chunks as they arrive → live, token-by-token UI.

So "use a Route Handler for streaming" isn't about extra server work — it's that only the
Route Handler's `Response` can *be* the stream the browser consumes incrementally.

> *Footnote:* advanced APIs (e.g. the AI SDK's `createStreamableValue`) can stream from a
> Server Action too — but a Route Handler returning a streaming `Response` is the standard,
> simplest streaming path, and it's also what webhooks require. So it's the natural home for
> our Generate nodes.

---

## Takeaways

1. **Server Component / Server Action / Route Handler all run on the server** and can hold
   secrets. They differ only in *how the client talks to them*.
2. **Reads need no endpoint** — a Server Component reads the DB and ships HTML.
3. **Writes are functions** — a Server Action is an endpoint you don't hand-build.
4. **Cut a real door (Route Handler) only for** streaming, webhooks, file responses, or
   external/non-React callers.
5. The "API" you build is small **on purpose** — most of it was never necessary once your
   pages live on the server.
