// Exercise 0 — A plain model call (NO tools, NO loop yet)
//
// GOAL: send one message to the model and print its reply.
//
// WHY THIS FIRST: this is the substrate every later primitive builds on.
// A `messages` array of { role, content } goes IN; an assistant message
// comes OUT. Tools, the loop, and "memory" are all just MORE entries in
// this same `messages` array. See it bare once, and the rest has a place
// to attach.
//
// RUN IT (after you fill in the TODO):
//   npx tsx --env-file=.env.local agent-lab/00-plain-call.ts
//
// HINTS (don't peek too hard — typing it is the point):
//   - The call:   await client.chat.completions.create({ model, messages })
//   - messages:   [{ role: "user", content: "...your question..." }]
//   - the reply:  response.choices[0].message.content
//   - model:      any chat model on your account, e.g. "gpt-4o-mini"

import OpenAI from "openai";

const client = new OpenAI(); // reads OPENAI_API_KEY from the environment

async function main() {
  // TODO — you type this part:
  // 1. Call client.chat.completions.create({ ... }) with a model and one user message.
  // 2. console.log the assistant's reply.
  //
  // Scaffold to fill in:
  //
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "in one sentence what is a video reel" }],
    });
    console.log(response.choices[0].message.content);
}

main();
