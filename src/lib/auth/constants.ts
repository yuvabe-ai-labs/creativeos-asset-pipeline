// The single source of truth for the Stage 4 write-gate's rejection message (D140).
// Both gates — assertImpersonationWriteAllowed (API routes) and withAction (server
// actions) — return this exact string, so the wording cannot drift between the two
// surfaces. Deliberately NOT "server-only": client components surface this message
// too, so it has to be importable from both environments.
export const IMPERSONATION_READ_ONLY_MESSAGE =
  "Read-only while impersonating — Enable editing to make changes.";
