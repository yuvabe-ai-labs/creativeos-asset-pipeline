// Exercise 2 — One tool ("the model can REQUEST an action")
//
// GOAL: give the model a tool, ask a question that needs it, and watch it
// hand you back a structured REQUEST to run that function — WITHOUT running it.
//
// The moment to watch:  finish_reason flips "stop" -> "tool_calls".
//   "stop"       = "I'm done talking."
//   "tool_calls" = "I don't want to talk, I want to DO something — please run this."
//
// We do NOT execute the tool here. Seeing the *request* is the whole lesson.
// (Executing it — and letting a human approve first — is Lesson 3: HITL.)
//
// RUN IT (after you type it in):
//   npx tsx --env-file=.env.local agent-lab/02-one-tool.ts

import OpenAI from "openai";

const client = new OpenAI();

// TODO 1 — define the tool here (walkthrough in chat)

async function main() {
  // TODO 2 — call create({ model, messages, tools }) with a question that needs
  //          the tool, then log finish_reason, content, and message.tool_calls
}

main();
