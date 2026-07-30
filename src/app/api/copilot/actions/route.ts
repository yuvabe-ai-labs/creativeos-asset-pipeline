import { apiError, apiOk } from "@/lib/api/route-helpers";
import { createOpenAI } from "@/lib/openai/server";
import { buildCopilotContext } from "@/lib/copilot/context";
import { PLAYBOOKS, PLAYBOOK_NAMES } from "@/lib/copilot/playbooks";
import { normalizeSlots } from "@/lib/copilot/runner";

// Lesson 5 — CALL 3: FUNCTION CALLING. We hand the model ONE tool (add_node) and let
// it decide — via tool_choice:"auto" — whether the user's message warrants an action.
// The model only *requests* the tool; it never runs it. We return that request as a
// proposal. Executing it (and gating it behind approval) is the next lesson (HITL).
//
// Note the shift from CALL 2: response_format forces a shape WE picked. A tool offers
// a shape the model may CHOOSE. Same structured-output machinery, opposite initiative.

// Node types the copilot may add. A curated, additive subset — the types whose
// creation is a plain addNode(type). file/draw open their editors on create, so the
// user lands in the upload/draw surface. kb/shot stay excluded (they need context —
// a client KB, a parsed script — a bare "add" can't supply).
const ADDABLE_NODE_TYPES = [
  "text",
  "script",
  "prompt",
  "image-gen",
  "video-prompt",
  "video-gen",
  "file",
  "draw",
] as const;

// The run_playbook tool's slot schema is built FROM the registry: every registered
// playbook contributes its slot keys, typed by kind. The model fills only what the
// sentence provides; the client's frame check asks for the rest.
const playbookSlotProperties = Object.fromEntries(
  Object.values(PLAYBOOKS).flatMap((p) =>
    p.slots.map((s) => [
      s.key,
      s.kind === "node-handles"
        ? {
            type: "array" as const,
            items: { type: "string" as const },
            description: `Node handles for "${s.key}" (e.g. FILE-08F1), if the user named any.`,
          }
        : {
            type: "string" as const,
            description: `Node handle for "${s.key}" (e.g. SHOT-1A2B), if identifiable from the message + canvas.`,
          },
    ]),
  ),
);

const tools = [
  {
    type: "function" as const,
    function: {
      name: "add_node",
      description:
        "Propose adding a new node to the canvas. Call this ONLY when the user asks to " +
        "create/add a node. For questions about the existing canvas, do not call it.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ADDABLE_NODE_TYPES,
            description: "The kind of node to add.",
          },
          title: {
            type: "string",
            description: "A short human label for the node, if the user implied one.",
          },
        },
        required: ["type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_script_node",
      description:
        "Create a Script node seeded with the reel script the user pasted or dropped into " +
        "THIS message. Call this when the user asks to turn their pasted/attached reel script " +
        "into a script node (whether or not they also say 'parse it'). Prefer this over " +
        "add_node whenever the message actually contains reel-script text.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description:
              "A short title for the reel/script, inferred from the script if one is clear.",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "parse_script",
      description:
        "Parse/extract a Script node the user has ALREADY created into structured shots. " +
        "Call this when the user asks to parse/extract the script, or confirms an offer to " +
        "parse it (e.g. replies 'yes'). Identify the node by its handle (e.g. SCR-1A2B) if " +
        "clear from the canvas; otherwise leave handle empty to parse the most recent script.",
      parameters: {
        type: "object",
        properties: {
          handle: {
            type: "string",
            description: "Handle of the Script node to parse, e.g. SCR-1A2B, if identifiable.",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "open_node",
      description:
        "Open a node's editor / focus view so the user can work on it — for a Shot this opens " +
        "its Composer, for a Prompt/Image/Video node its focus view. Call this when the user asks " +
        "to open, edit, compose, or work on a specific existing node. Identify it by its handle " +
        "(e.g. SHOT-1A2B).",
      parameters: {
        type: "object",
        properties: {
          handle: {
            type: "string",
            description: "Handle of the node to open, e.g. SHOT-1A2B.",
          },
        },
        required: ["handle"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "connect_nodes",
      description:
        "Wire nodes together. Call this when the user asks to connect/link/wire nodes. Each " +
        "handle in `from` becomes the SOURCE of an edge into the single `to` target " +
        "(direction: from → to). Handles look like FILE-469A / PRM-3C4D.",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "array",
            items: { type: "string" },
            description: "One or more source node handles.",
          },
          to: { type: "string", description: "The single target node handle." },
        },
        required: ["from", "to"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_playbook",
      description:
        "Run a multi-step playbook for a COMPLEX request that needs several actions in " +
        "sequence. Available playbooks:\n" +
        Object.values(PLAYBOOKS)
          .map((p) => `- ${p.name}: ${p.description}`)
          .join("\n") +
        "\nExtract only the slot values the user's message actually provides (resolve " +
        "references like 'shot 2' to the handle using the canvas above) — leave missing " +
        "slots out; the client asks for them. Prefer the single-action tools for simple " +
        "one-step commands.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", enum: PLAYBOOK_NAMES },
          slots: {
            type: "object",
            properties: playbookSlotProperties,
            additionalProperties: false,
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | {
        messages?: { role: "user" | "assistant"; content: string }[];
        canvasId?: string;
        mentionedIds?: string[];
        elicit?: { playbook?: string; slotKey?: string; question?: string };
      }
    | null;
  const history = Array.isArray(body?.messages) ? body.messages : [];
  const canvasId = body?.canvasId;
  if (history.length === 0) return apiError("A 'messages' history is required.", 400);
  if (!canvasId) return apiError("A 'canvasId' is required.", 400);

  // Same grounding as the other calls (handles + @-referenced nodes spotlighted) — so
  // "add a prompt like @PRM-A3F9" has the exact node in view.
  const canvasContext = await buildCopilotContext(canvasId, body?.mentionedIds ?? []);

  // Elicitation fallback (runner spec §2.2): the client couldn't resolve a slot answer
  // itself (no @-mention, not "none"), so the model extracts the handle from free text.
  const elicit =
    body?.elicit?.playbook && body?.elicit?.slotKey && body?.elicit?.question
      ? { playbook: body.elicit.playbook, slotKey: body.elicit.slotKey, question: body.elicit.question }
      : null;

  try {
    const openai = createOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      tools,
      tool_choice: "auto", // the MODEL decides whether to call add_node
      messages: [
        {
          role: "system",
          content:
            "You are the copilot inside CreativeOS. Read the WHOLE conversation, especially your " +
            "own last message. A short reply that confirms your last offer — 'yes', 'yeah', 'ok', " +
            "'sure', 'do it', even misspelled ('reyes', 'yse') — means DO WHAT YOU JUST OFFERED, " +
            "not create something new. If you offered to parse a script you just created, call " +
            "parse_script and pass the handle from your 'Created a Script node …' message. " +
            "Call create_script_node ONLY when the message itself contains an actual reel script " +
            "(multiple lines / shot descriptions) to turn into a node — never for a short reply. " +
            "If the user asks to add/create some other node, call add_node with the best-fitting " +
            "type. If it is just a question about the canvas, do not call any tool.",
        },
        { role: "system", content: canvasContext },
        ...(elicit
          ? [
              {
                role: "system" as const,
                content:
                  `The user's latest message answers your question: "${elicit.question}". ` +
                  `Work out which node(s) on the canvas above it refers to and call run_playbook ` +
                  `with name "${elicit.playbook}" and ONLY the slot "${elicit.slotKey}" filled ` +
                  `with the handle(s). If the message doesn't identify any node, call no tool.`,
              },
            ]
          : []),
        ...history,
      ],
    });

    // The requested action lives in tool_calls, NOT in message.content. Arguments come
    // back as a JSON *string* the model wrote — parse it defensively.
    const call = completion.choices[0]?.message?.tool_calls?.[0];
    if (!call || call.type !== "function") {
      return apiOk({ action: null });
    }

    let args: {
      type?: string;
      title?: string;
      handle?: string;
      from?: string[];
      to?: string;
      name?: string;
      slots?: unknown;
    };
    try {
      args = JSON.parse(call.function.arguments) as {
        type?: string;
        title?: string;
        handle?: string;
        from?: string[];
        to?: string;
        name?: string;
        slots?: unknown;
      };
    } catch {
      return apiOk({ action: null });
    }

    // parse_script: the target Script node already exists; the model may name it by handle,
    // or leave it empty for the client to default to the most recent script node.
    if (call.function.name === "parse_script") {
      return apiOk({
        action: {
          name: "parse_script" as const,
          args: { handle: args.handle?.trim() || undefined },
        },
      });
    }

    // open_node: needs an explicit handle — the client resolves it to a node id and opens
    // that node's surface (Composer for a Shot, focus view otherwise) via setFocusedNodeId.
    if (call.function.name === "open_node") {
      const handle = args.handle?.trim();
      if (!handle) return apiOk({ action: null });
      return apiOk({ action: { name: "open_node" as const, args: { handle } } });
    }

    // create_script_node: nothing to guard — the source is the user's pasted text
    // (the client passes it along), so the model only supplies an optional title.
    if (call.function.name === "create_script_node") {
      return apiOk({
        action: {
          name: "create_script_node" as const,
          args: { title: args.title?.trim() || undefined },
        },
      });
    }

    if (call.function.name === "add_node") {
      // Guard the enum on our side too — never trust the model's string blindly.
      const type = args.type;
      if (!type || !ADDABLE_NODE_TYPES.includes(type as (typeof ADDABLE_NODE_TYPES)[number])) {
        return apiOk({ action: null });
      }
      return apiOk({
        action: {
          name: "add_node" as const,
          args: { type, title: args.title?.trim() || undefined },
        },
      });
    }

    if (call.function.name === "connect_nodes") {
      const from = (args.from ?? []).map((h) => h.trim()).filter(Boolean);
      const to = args.to?.trim();
      if (!from.length || !to) return apiOk({ action: null });
      return apiOk({ action: { name: "connect_nodes" as const, args: { from, to } } });
    }

    // run_playbook: guard the enum, defensively normalize the model-written slots,
    // and pass through — frame completeness is the CLIENT's job (spec §2.2).
    if (call.function.name === "run_playbook") {
      const name = args.name?.trim();
      if (!name || !PLAYBOOK_NAMES.includes(name)) return apiOk({ action: null });
      return apiOk({
        action: { name: "run_playbook" as const, args: { name, slots: normalizeSlots(args.slots) } },
      });
    }

    return apiOk({ action: null });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Actions lookup failed.", 500);
  }
}
