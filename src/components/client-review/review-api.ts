import type { PublicReview, ReviewComment } from "@/lib/client-review/wire";

async function json<T>(res: Response, fallback: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? fallback);
  return body;
}

export async function fetchReview(token: string): Promise<PublicReview> {
  return json<PublicReview>(await fetch(`/api/r/${token}`, { cache: "no-store" }), "Could not load the review.");
}

export async function postComment(
  token: string,
  input: { authorName: string; body: string; timecodeMs: number },
): Promise<ReviewComment> {
  const res = await fetch(`/api/r/${token}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await json<{ comment: ReviewComment }>(res, "Could not post the comment.")).comment;
}

export async function editComment(
  token: string,
  commentId: string,
  input: { editorName: string; body: string },
): Promise<ReviewComment> {
  const res = await fetch(`/api/r/${token}/comments/${commentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await json<{ comment: ReviewComment }>(res, "Could not save the edit.")).comment;
}
