// src/lib/script-review/validate.ts
import { COMMENT_BODY_MAX, REVIEWER_NAME_MAX } from "@/lib/client-review/constants";
import { record, text, type Parsed } from "@/lib/client-review/validate";
import { isShareScope, isTeamStageMove, type ShareScope, type TeamStageMove } from "./constants";
import { parsePart } from "./parts";
import type { Part } from "./types";

const INVALID = { ok: false, error: "Invalid request body." } as const;
const isVersionNumber = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 100_000;

/** The client's new comment: their typed name, the text, the part, and the version on their screen. */
export function parseNewScriptComment(
  input: unknown,
): Parsed<{ authorName: string; body: string; part: Part; versionNumber: number }> {
  const o = record(input);
  if (!o) return INVALID;
  const name = text(o.authorName, "Name", REVIEWER_NAME_MAX);
  if (!name.ok) return name;
  const body = text(o.body, "Comment", COMMENT_BODY_MAX);
  if (!body.ok) return body;
  const part = parsePart(o.part);
  if (!part) return { ok: false, error: "Say which part of the reel the comment is about." };
  const versionNumber = o.versionNumber;
  if (!isVersionNumber(versionNumber)) return { ok: false, error: "A version is required." };
  return { ok: true, value: { authorName: name.value, body: body.value, part, versionNumber } };
}

export function parseReply(input: unknown): Parsed<{ body: string }> {
  const o = record(input);
  if (!o) return INVALID;
  const body = text(o.body, "Reply", COMMENT_BODY_MAX);
  return body.ok ? { ok: true, value: { body: body.value } } : body;
}

export function parseResolve(input: unknown): Parsed<{ resolved: boolean }> {
  const o = record(input);
  if (!o || typeof o.resolved !== "boolean") return INVALID;
  return { ok: true, value: { resolved: o.resolved } };
}

export function parseApproval(input: unknown): Parsed<{ approverName: string; versionNumber: number }> {
  const o = record(input);
  if (!o) return INVALID;
  const name = text(o.approverName, "Name", REVIEWER_NAME_MAX);
  if (!name.ok) return name;
  const versionNumber = o.versionNumber;
  if (!isVersionNumber(versionNumber)) return { ok: false, error: "A version is required." };
  return { ok: true, value: { approverName: name.value, versionNumber } };
}

export function parseShare(input: unknown): Parsed<{ scope: ShareScope }> {
  const scope = record(input)?.scope;
  return isShareScope(scope) ? { ok: true, value: { scope } } : { ok: false, error: "Choose what the share includes." };
}

export function parseStageMove(input: unknown): Parsed<{ move: TeamStageMove }> {
  const move = record(input)?.move;
  return isTeamStageMove(move) ? { ok: true, value: { move } } : { ok: false, error: "Unknown stage move." };
}
