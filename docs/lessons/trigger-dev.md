# Trigger.dev — What It Is & How It Works in CreativeOS

## The Problem It Solves

Video generation takes **30–600 seconds**. You cannot run that inside a Next.js API route — the browser connection times out, Vercel kills the function, and the user stares at a broken spinner.

Trigger.dev is a **background job runner**. It takes long, heavy work *out* of your API route, runs it on a separate server that has no timeout, and lets your app stay fast and responsive.

---

## The Mental Model

Think of it like a restaurant kitchen:

| Role | In CreativeOS |
|---|---|
| Waiter (takes order, returns fast) | Next.js API route `/api/nodes/[id]/video-generate` |
| Kitchen ticket system | Trigger.dev |
| Chef (does the actual cooking, no rush) | `trigger/video-generate.ts` task |
| Waiter brings food back | Webhook `/api/webhooks/generation` |

The waiter doesn't cook — they just hand the ticket to the kitchen and immediately tell the customer *"it's being made."*

---

## The 3 Core Pieces

### 1. The Task — `trigger/video-generate.ts`

This is the actual work. It runs **on Trigger.dev's servers**, not on Vercel.

```ts
import { task, logger, wait } from "@trigger.dev/sdk/v3";

export const videoGenerateTask = task({
  id: "video-generate",     // ← unique name you reference everywhere
  maxDuration: 600,          // ← can run up to 10 minutes, no problem
  run: async (payload: {
    generationId: string;
    modelId: string;
    prompt: string;
    // ...
  }) => {
    // Call the AI video API here (takes 30–300s)
    // Trigger.dev doesn't care how long this takes
    
    // When done, call your app's webhook to report back
    await fetch(`${appUrl}/api/webhooks/generation`, {
      method: "POST",
      body: JSON.stringify({ generationId, status: "succeeded", videoUrl }),
    });
  },
});
```

**Key things:**
- `id: "video-generate"` is the task's unique identifier. You use this string to trigger it.
- `maxDuration: 600` lets it run up to 10 minutes.
- The `payload` is whatever data you send when triggering — fully typed.
- At the end it **calls back** to your app via a webhook (because it can't return data to a waiting request — the API route already responded).

---

### 2. The Trigger — `src/app/api/nodes/[id]/video-generate/route.ts`

This is your normal Next.js API route. It does 3 things and returns immediately:

```ts
import { tasks } from "@trigger.dev/sdk/v3";

export async function POST(req, { params }) {
  // 1. Validate the request & gather inputs
  const { prompt, modelId, ... } = await buildInputs(req, params);

  // 2. Save a "running" record in the database
  const generation = await insertGeneration({ nodeId, type: "video", ... });

  // 3. Fire the background task — NO await on the heavy work
  await tasks.trigger("video-generate", {
    generationId: generation.id,
    modelId,
    prompt,
    // ...
  });

  // Return IMMEDIATELY — the task runs in the background
  return apiOk({ generationId: generation.id }, 202);
}
```

`202 Accepted` means *"I got your request, work is happening, but it's not done yet."*

The UI can use `generationId` to poll or subscribe to updates.

---

### 3. The Webhook — `src/app/api/webhooks/generation`

When the Trigger.dev task finishes (success or failure), it calls this route to report back:

```ts
export async function POST(req: Request) {
  const body = await req.json();
  // body = { generationId, status: "succeeded" | "failed", videoUrl }

  await completeGeneration(body);  // saves result to DB, updates node state
  return apiOk({ ok: true });
}
```

This is how results get back into your app — the task reaches back in via HTTP.

---

## The Full Flow, Step by Step

```
User clicks "Generate Video"
        │
        ▼
POST /api/nodes/[id]/video-generate          (Next.js — runs < 1s)
  │  1. Build prompt + inputs
  │  2. INSERT generation { status: 'running' }
  │  3. tasks.trigger("video-generate", payload)
  └──► Returns { generationId } immediately
        │
        ▼
Trigger.dev picks up the job               (Trigger.dev servers — runs 30–300s)
  │  Calls AI video API
  │  Waits for video to render
  └──► POST /api/webhooks/generation { generationId, status, videoUrl }
        │
        ▼
Webhook handler                             (Next.js — runs < 1s)
  │  UPDATE generation { status: 'succeeded', videoUrl }
  │  UPDATE node output
  └──► UI polls DB or subscribes → shows video
```

---

## The Config File — `trigger.config.ts`

```ts
import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_mlnaizhphqpdqwzctaag",  // ← your Trigger.dev project ID
  dirs: ["./trigger"],                    // ← where your task files live
  maxDuration: 600,                       // ← default max for all tasks
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 2,           // ← if it fails, retry up to 2 times
      minTimeoutInMs: 5000,
      maxTimeoutInMs: 30000,
      factor: 2,                // ← wait 5s, then 10s between retries
    },
  },
});
```

This file tells Trigger.dev: *"My tasks are in `/trigger`, retry failures twice, allow 10-minute runs."*

---

## Mock Mode (Current State)

Right now `trigger/video-generate.ts` has `MOCK_MODE = true`. Instead of calling a real AI API, it:

1. Waits 30 seconds (`await wait.for({ seconds: 30 })`)
2. Posts a hardcoded MP4 URL to the webhook

This lets the whole flow — trigger → wait → webhook → result — be tested without spending money on AI calls.

```ts
const MOCK_MODE = true;                                        // ← flip to false for real AI
const MOCK_VIDEO_URL = "https://www.w3schools.com/html/mov_bbb.mp4";
```

---

## Running Locally

Trigger.dev tasks don't run on your local Next.js dev server. You need the Trigger.dev dev runner:

```bash
# Terminal 1 — Next.js
npm run dev

# Terminal 2 — Trigger.dev (listens for tasks and runs them locally)
npx trigger.dev@latest dev
```

Without Terminal 2, calling `tasks.trigger(...)` will queue the job in the cloud but nothing will execute locally.

---

## Key Concepts to Remember

| Concept | What it means |
|---|---|
| **Task** | A function in `/trigger/*.ts` that runs on Trigger.dev servers |
| **Trigger** | Calling `tasks.trigger("task-id", payload)` from your API route |
| **Payload** | The data you pass to the task (generationId, prompt, etc.) |
| **Webhook** | How the task reports its result back to your Next.js app |
| **maxDuration** | How long the task is allowed to run (up to 15 minutes) |
| **Retry** | Automatic re-run if the task throws an error |
| **Mock mode** | Running fake logic locally to test the flow without real API calls |

---

## Why Not Just Use a Queue / Serverless Function?

- **Vercel functions** max out at 10–60 seconds. Video gen needs up to 5 minutes.
- **Trigger.dev** gives you: retries, logging, real-time run monitoring, typed payloads, and a dashboard to see every run — all built in.
- The Trigger.dev **dashboard** (trigger.dev) lets you see every run, its logs, status, and output — very useful for debugging.
