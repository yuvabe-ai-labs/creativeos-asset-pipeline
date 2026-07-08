import { createOpenAI } from "@/lib/openai/server";
import { apiError, apiOk, withTryCatch } from "@/lib/api/route-helpers";
import { listNodes } from "@/lib/db/nodes";
import { listEdges } from "@/lib/db/edges";

// Lesson 2 — GROUNDING: give the copilot the REAL canvas so it can answer about
// YOUR actual nodes. The whole idea: real app state becomes just another
// { role, content } entry in `messages`. Fill in the 🔵 blanks below.
export async function POST(req: Request) {
  return withTryCatch("Copilot request failed.", async () => {
    const body = (await req.json()) as { message?: string; canvasId?: string };
    const message = body.message?.trim();
    const canvasId = body.canvasId;
    if (!message) return apiError("A 'message' is required.", 400);
    if (!canvasId) return apiError("A 'canvasId' is required.", 400);

    // 🔵 FILL IN 1 — read the REAL canvas from the database.
    //    hint:  await listNodes(canvasId)   and   await listEdges(canvasId)
    const nodes = ____;
    const edges = ____;

    // 🔵 FILL IN 2 — GROUNDING: describe that state as text for the model.
    //    THIS is the lesson. How you describe it is a real design choice.
    //    hint: build a string. Each node has  n.id, n.type, and a title at
    //    (n.data as { title?: string }).title.  Mention how many edges there are.
    const canvasContext = ____;

    const openai = createOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are the copilot inside CreativeOS. You CAN see the canvas — it is " +
            "described in the next message. Be brief and concrete; refer to real nodes " +
            "by their title and type.",
        },
        // grounding: the real canvas, injected as context the model reads
        { role: "system", content: canvasContext },
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices[0]?.message?.content ?? "";
    return apiOk({ reply });
  });
}
