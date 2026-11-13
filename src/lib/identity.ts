// The signed-in person's display name, from the session via /api/me (useIdentity()). What they
// may do is their Access (D504), never here. Use this to decide what to RENDER, never what to
// permit: the server checks every route and action.
export type Identity = { name: string };
